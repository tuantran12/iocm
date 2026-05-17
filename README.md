# IOCM — Institute Operating & Compliance Manager

Hệ thống quản trị vận hành và tuân thủ cho Viện Nghiên cứu Ứng dụng Công nghệ & Đổi mới sáng tạo.

## Tech Stack

- **Framework**: Next.js 15 (App Router, React 19)
- **UI**: MUI v9 (Material Design 3)
- **API**: tRPC v11
- **Database**: PostgreSQL 16 + Prisma 6
- **Auth**: NextAuth v5
- **Real-time**: Socket.io 4
- **Testing**: Vitest (unit) + Playwright (E2E)

## Development

```bash
# Cài đặt dependencies
npm install

# Khởi động PostgreSQL + Redis (Docker)
docker compose up -d postgres redis

# Chạy migrations
npx prisma migrate dev

# Seed data
npx prisma db seed

# Chạy dev server
npm run dev
```

App chạy tại: http://localhost:3000

## Testing

```bash
# Unit tests
npm run test

# E2E tests (cần app đang chạy)
npm run e2e

# E2E với UI mode
npm run e2e:ui
```

---

## Deployment (Production)

### Yêu cầu

- VPS với Docker + Docker Compose
- Domain với SSL certificate (Let's Encrypt hoặc tương đương)
- PostgreSQL 16, Redis 7

### Cấu hình

1. Copy file environment:
   ```bash
   cp .env.production.example .env.production
   ```

2. Điền giá trị thật vào `.env.production`:
   - `DATABASE_URL` — connection string PostgreSQL
   - `NEXTAUTH_SECRET` — tạo bằng `openssl rand -base64 32`
   - `NEXTAUTH_URL` — domain production (https://...)
   - `REDIS_PASSWORD` — password Redis
   - `SMTP_*` — cấu hình email
   - `S3_*` — cấu hình file storage

3. Đặt SSL certificates vào `./certs/`:
   - `fullchain.pem`
   - `privkey.pem`

### Deploy

```bash
# Deploy lần đầu hoặc cập nhật
./deploy.sh
```

Script `deploy.sh` sẽ tự động:
- Pull code mới nhất
- Backup database
- Build Docker images
- Chạy migrations
- Restart services
- Health check

### Docker Compose Production

```bash
# Khởi động tất cả services
docker compose -f docker-compose.prod.yml up -d

# Xem logs
docker compose -f docker-compose.prod.yml logs -f app

# Dừng services
docker compose -f docker-compose.prod.yml down
```

### Backup Database

```bash
# Chạy backup thủ công
./scripts/backup-db.sh

# Cài cron job (chạy lúc 2:00 AM hàng ngày)
# crontab -e
# 0 2 * * * /opt/iocm/scripts/backup-db.sh >> /var/log/iocm-backup.log 2>&1
```

Retention policy:
- **Daily**: giữ 7 bản gần nhất
- **Weekly**: giữ 4 bản (tạo vào Chủ nhật)

### CI/CD

Pipeline GitHub Actions (`.github/workflows/ci.yml`):
1. **Lint** — ESLint + TypeScript type check
2. **Test** — Vitest với PostgreSQL service container
3. **Build** — Next.js production build
4. **Deploy** — SSH vào VPS, chạy `deploy.sh` (chỉ trên branch `main`)

### Chạy E2E Tests trên Production

> **Lưu ý**: Chỉ chạy E2E tests trên production khi cần verify deployment.
> Sử dụng test account riêng, KHÔNG dùng account thật.

```bash
# Chạy E2E tests với production URL
PLAYWRIGHT_BASE_URL=https://iocm.vien-nghien-cuu.vn npx playwright test

# Hoặc chạy verification script
./scripts/verify-deployment.sh https://iocm.vien-nghien-cuu.vn
```

E2E tests sẽ kiểm tra:
- Login flow hoạt động
- Dashboard hiển thị đúng
- Tạo/sửa/xóa tài liệu
- Quản lý hội viên
- Chat trong nhóm
- Thông báo xuất hiện

### Verify Deployment

```bash
# Kiểm tra nhanh sau deploy
./scripts/verify-deployment.sh

# Kiểm tra với URL cụ thể
./scripts/verify-deployment.sh https://your-domain.com
```

### Troubleshooting

```bash
# Xem logs app
docker compose -f docker-compose.prod.yml logs -f app

# Xem logs nginx
docker compose -f docker-compose.prod.yml logs -f nginx

# Restart app
docker compose -f docker-compose.prod.yml restart app

# Vào container debug
docker compose -f docker-compose.prod.yml exec app sh

# Kiểm tra database
docker compose -f docker-compose.prod.yml exec postgres psql -U iocm -d iocm
```
