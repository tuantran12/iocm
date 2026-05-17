#!/bin/bash
# =============================================================================
# IOCM Deployment Verification Script
# Viện Nghiên cứu Ứng dụng Công nghệ & Đổi mới sáng tạo
# =============================================================================
# Sử dụng: ./scripts/verify-deployment.sh [BASE_URL]
# Mặc định: http://localhost:3000
# Ví dụ:   ./scripts/verify-deployment.sh https://iocm.vien-nghien-cuu.vn
# =============================================================================
# Script kiểm tra các endpoint quan trọng sau deploy:
#   - Health check API
#   - Login page render
#   - Auth API hoạt động
#   - tRPC endpoints phản hồi
#   - Static assets load được
#   - WebSocket endpoint
# =============================================================================

set -euo pipefail

# --- Cấu hình ---
BASE_URL="${1:-http://localhost:3000}"
TIMEOUT=10
PASSED=0
FAILED=0
TOTAL=0

# --- Màu sắc ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# --- Hàm tiện ích ---
log() { echo -e "$1"; }

check() {
    local description="$1"
    local url="$2"
    local expected_status="${3:-200}"
    local extra_args="${4:-}"
    
    TOTAL=$((TOTAL + 1))
    
    # Thực hiện request
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time ${TIMEOUT} \
        --insecure \
        ${extra_args} \
        "${url}" 2>/dev/null) || response="000"
    
    if [ "${response}" = "${expected_status}" ]; then
        log "  ${GREEN}✓${NC} ${description} (HTTP ${response})"
        PASSED=$((PASSED + 1))
    else
        log "  ${RED}✗${NC} ${description} — expected ${expected_status}, got ${response}"
        FAILED=$((FAILED + 1))
    fi
}

check_contains() {
    local description="$1"
    local url="$2"
    local expected_text="$3"
    
    TOTAL=$((TOTAL + 1))
    
    local body
    body=$(curl -s --max-time ${TIMEOUT} --insecure "${url}" 2>/dev/null) || body=""
    
    if echo "${body}" | grep -qi "${expected_text}"; then
        log "  ${GREEN}✓${NC} ${description}"
        PASSED=$((PASSED + 1))
    else
        log "  ${RED}✗${NC} ${description} — không tìm thấy '${expected_text}'"
        FAILED=$((FAILED + 1))
    fi
}

# =============================================================================
log ""
log "=== IOCM Deployment Verification ==="
log "URL: ${BASE_URL}"
log "Thời gian: $(date '+%Y-%m-%d %H:%M:%S')"
log ""

# =============================================================================
# 1. Health Check
# =============================================================================
log "${YELLOW}[1/6] Health Check${NC}"
check "API health endpoint" "${BASE_URL}/api/health"

# =============================================================================
# 2. Login Page
# =============================================================================
log "${YELLOW}[2/6] Login Page${NC}"
check "Login page loads" "${BASE_URL}/login"
check_contains "Login page có form đăng nhập" "${BASE_URL}/login" "login\|đăng nhập\|email\|password"

# =============================================================================
# 3. Auth API
# =============================================================================
log "${YELLOW}[3/6] Auth API${NC}"
check "NextAuth session endpoint" "${BASE_URL}/api/auth/session"
check "NextAuth CSRF endpoint" "${BASE_URL}/api/auth/csrf"
check "NextAuth providers endpoint" "${BASE_URL}/api/auth/providers"

# =============================================================================
# 4. tRPC API
# =============================================================================
log "${YELLOW}[4/6] tRPC Endpoints${NC}"
# tRPC endpoints trả về 401 nếu chưa auth (đó là đúng)
check "tRPC endpoint phản hồi" "${BASE_URL}/api/trpc/documents.list" "401"

# =============================================================================
# 5. Static Assets
# =============================================================================
log "${YELLOW}[5/6] Static Assets${NC}"
check "Next.js app loads" "${BASE_URL}/"
check_contains "HTML response có Next.js markers" "${BASE_URL}/" "_next\|__next"

# =============================================================================
# 6. Redirects & Security
# =============================================================================
log "${YELLOW}[6/6] Security & Redirects${NC}"
# Protected routes nên redirect về login
check "Dashboard redirect khi chưa login" "${BASE_URL}/dashboard" "307"
check "Documents redirect khi chưa login" "${BASE_URL}/documents" "307"

# =============================================================================
# Tổng kết
# =============================================================================
log ""
log "=== Kết quả ==="
log "  Tổng: ${TOTAL} checks"
log "  ${GREEN}Passed: ${PASSED}${NC}"
log "  ${RED}Failed: ${FAILED}${NC}"
log ""

if [ ${FAILED} -eq 0 ]; then
    log "${GREEN}=== ✓ DEPLOYMENT VERIFICATION PASSED ===${NC}"
    log "Tất cả endpoints hoạt động bình thường."
    exit 0
else
    log "${RED}=== ✗ DEPLOYMENT VERIFICATION FAILED ===${NC}"
    log "${FAILED}/${TOTAL} checks thất bại. Kiểm tra logs để debug."
    exit 1
fi
