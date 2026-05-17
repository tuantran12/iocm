#!/bin/bash
# =============================================================================
# IOCM Deployment Script — VPS Production
# Viện Nghiên cứu Ứng dụng Công nghệ & Đổi mới sáng tạo
# =============================================================================
# Sử dụng: ./deploy.sh
# Script này chạy trên VPS, thực hiện:
#   1. Pull code mới nhất
#   2. Build Docker images
#   3. Chạy database migrations
#   4. Restart services
#   5. Health check
# =============================================================================

set -euo pipefail

# --- Cấu hình ---
APP_DIR="${APP_DIR:-/opt/iocm}"
COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_CHECK_URL="http://localhost:3000/api/health"
HEALTH_CHECK_RETRIES=10
HEALTH_CHECK_INTERVAL=5

# --- Màu sắc output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# --- Hàm tiện ích ---
log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# =============================================================================
# Bước 0: Kiểm tra điều kiện
# =============================================================================
log "=== IOCM Deployment bắt đầu ==="
log "Thời gian: $(date '+%Y-%m-%d %H:%M:%S')"

cd "${APP_DIR}" || error "Không tìm thấy thư mục ${APP_DIR}"

if [ ! -f "${COMPOSE_FILE}" ]; then
    error "Không tìm thấy ${COMPOSE_FILE}"
fi

if [ ! -f ".env.production" ]; then
    error "Không tìm thấy .env.production — copy từ .env.production.example"
fi

# =============================================================================
# Bước 1: Pull code mới nhất
# =============================================================================
log "Bước 1: Pull code mới nhất từ git..."
git fetch origin main
git reset --hard origin/main
log "Code đã cập nhật: $(git log --oneline -1)"

# =============================================================================
# Bước 2: Backup database trước khi deploy
# =============================================================================
log "Bước 2: Backup database trước khi deploy..."
if [ -f "scripts/backup-db.sh" ]; then
    bash scripts/backup-db.sh || warn "Backup thất bại, tiếp tục deploy..."
else
    warn "Không tìm thấy backup script, bỏ qua backup"
fi

# =============================================================================
# Bước 3: Build Docker images
# =============================================================================
log "Bước 3: Build Docker images..."
docker compose -f "${COMPOSE_FILE}" build --no-cache app
log "Build hoàn tất"

# =============================================================================
# Bước 4: Chạy database migrations
# =============================================================================
log "Bước 4: Chạy database migrations..."
docker compose -f "${COMPOSE_FILE}" run --rm app npx prisma migrate deploy
log "Migrations hoàn tất"

# =============================================================================
# Bước 5: Restart services
# =============================================================================
log "Bước 5: Restart services..."
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans
log "Services đã restart"

# =============================================================================
# Bước 6: Health check
# =============================================================================
log "Bước 6: Kiểm tra health..."
sleep 5  # Đợi app khởi động

HEALTHY=false
for i in $(seq 1 ${HEALTH_CHECK_RETRIES}); do
    if curl -sf "${HEALTH_CHECK_URL}" > /dev/null 2>&1; then
        HEALTHY=true
        break
    fi
    log "  Health check lần ${i}/${HEALTH_CHECK_RETRIES} — đợi ${HEALTH_CHECK_INTERVAL}s..."
    sleep ${HEALTH_CHECK_INTERVAL}
done

if [ "${HEALTHY}" = true ]; then
    log "✓ Health check PASSED — App đang chạy bình thường"
else
    error "✗ Health check FAILED sau ${HEALTH_CHECK_RETRIES} lần thử. Kiểm tra logs: docker compose -f ${COMPOSE_FILE} logs app"
fi

# =============================================================================
# Bước 7: Dọn dẹp Docker images cũ
# =============================================================================
log "Bước 7: Dọn dẹp images cũ..."
docker image prune -f --filter "until=24h" 2>/dev/null || true

# =============================================================================
# Hoàn tất
# =============================================================================
log "=== Deployment hoàn tất thành công ==="
log "Thời gian: $(date '+%Y-%m-%d %H:%M:%S')"
log "URL: $(grep APP_URL .env.production | cut -d'=' -f2 | tr -d '\"')"
docker compose -f "${COMPOSE_FILE}" ps
