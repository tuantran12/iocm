#!/bin/bash
# =============================================================================
# IOCM Database Backup Script
# Viện Nghiên cứu Ứng dụng Công nghệ & Đổi mới sáng tạo
# =============================================================================
# Sử dụng: ./scripts/backup-db.sh
# Cron: 0 2 * * * /path/to/iocm/scripts/backup-db.sh >> /var/log/iocm-backup.log 2>&1
# =============================================================================

set -euo pipefail

# --- Cấu hình ---
BACKUP_DIR="${BACKUP_DIR:-./backups}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-iocm-postgres-prod}"
POSTGRES_USER="${POSTGRES_USER:-iocm}"
POSTGRES_DB="${POSTGRES_DB:-iocm}"

# Retention: giữ 7 bản daily, 4 bản weekly
DAILY_RETENTION="${BACKUP_RETENTION_DAYS:-7}"
WEEKLY_RETENTION="${BACKUP_RETENTION_WEEKS:-4}"

# --- Biến thời gian ---
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DAY_OF_WEEK=$(date +"%u")  # 1=Monday, 7=Sunday
DATE_TODAY=$(date +"%Y-%m-%d")

# --- Tạo thư mục backup ---
DAILY_DIR="${BACKUP_DIR}/daily"
WEEKLY_DIR="${BACKUP_DIR}/weekly"
mkdir -p "${DAILY_DIR}" "${WEEKLY_DIR}"

# --- Hàm log ---
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# --- Hàm xử lý lỗi ---
error_exit() {
    log "LỖI: $1"
    exit 1
}

# =============================================================================
# Bước 1: Tạo backup
# =============================================================================
log "Bắt đầu backup database IOCM..."

BACKUP_FILE="${DAILY_DIR}/iocm_${TIMESTAMP}.sql.gz"

# Chạy pg_dump trong Docker container, nén bằng gzip
if docker exec "${POSTGRES_CONTAINER}" pg_dump \
    -U "${POSTGRES_USER}" \
    -d "${POSTGRES_DB}" \
    --format=custom \
    --compress=6 \
    --verbose \
    2>/dev/null | gzip > "${BACKUP_FILE}"; then
    log "Backup thành công: ${BACKUP_FILE}"
    log "Kích thước: $(du -h "${BACKUP_FILE}" | cut -f1)"
else
    # Thử cách khác: pg_dump format plain + gzip
    BACKUP_FILE="${DAILY_DIR}/iocm_${TIMESTAMP}.sql.gz"
    if docker exec "${POSTGRES_CONTAINER}" pg_dump \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        --no-owner \
        --no-privileges \
        2>/dev/null | gzip > "${BACKUP_FILE}"; then
        log "Backup thành công (plain format): ${BACKUP_FILE}"
        log "Kích thước: $(du -h "${BACKUP_FILE}" | cut -f1)"
    else
        error_exit "Không thể tạo backup database"
    fi
fi

# Kiểm tra file backup có dữ liệu
if [ ! -s "${BACKUP_FILE}" ]; then
    rm -f "${BACKUP_FILE}"
    error_exit "File backup rỗng, có thể database không truy cập được"
fi

# =============================================================================
# Bước 2: Weekly backup (Chủ nhật)
# =============================================================================
if [ "${DAY_OF_WEEK}" = "7" ]; then
    WEEKLY_FILE="${WEEKLY_DIR}/iocm_weekly_${DATE_TODAY}.sql.gz"
    cp "${BACKUP_FILE}" "${WEEKLY_FILE}"
    log "Tạo weekly backup: ${WEEKLY_FILE}"
fi

# =============================================================================
# Bước 3: Xóa backup cũ (retention policy)
# =============================================================================
log "Áp dụng retention policy..."

# Xóa daily backups cũ hơn N ngày
DELETED_DAILY=$(find "${DAILY_DIR}" -name "iocm_*.sql.gz" -mtime +${DAILY_RETENTION} -delete -print | wc -l)
if [ "${DELETED_DAILY}" -gt 0 ]; then
    log "Đã xóa ${DELETED_DAILY} daily backup(s) cũ hơn ${DAILY_RETENTION} ngày"
fi

# Xóa weekly backups cũ hơn N tuần
WEEKLY_DAYS=$((WEEKLY_RETENTION * 7))
DELETED_WEEKLY=$(find "${WEEKLY_DIR}" -name "iocm_weekly_*.sql.gz" -mtime +${WEEKLY_DAYS} -delete -print | wc -l)
if [ "${DELETED_WEEKLY}" -gt 0 ]; then
    log "Đã xóa ${DELETED_WEEKLY} weekly backup(s) cũ hơn ${WEEKLY_RETENTION} tuần"
fi

# =============================================================================
# Bước 4: Tổng kết
# =============================================================================
TOTAL_DAILY=$(find "${DAILY_DIR}" -name "iocm_*.sql.gz" | wc -l)
TOTAL_WEEKLY=$(find "${WEEKLY_DIR}" -name "iocm_weekly_*.sql.gz" | wc -l)
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)

log "=== Tổng kết backup ==="
log "  Daily backups: ${TOTAL_DAILY} bản"
log "  Weekly backups: ${TOTAL_WEEKLY} bản"
log "  Tổng dung lượng: ${TOTAL_SIZE}"
log "Backup hoàn tất."
