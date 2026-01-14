# SendGrid Setup Guide - Thiên Phú Mút HR

## 📋 Tổng Quan

Project sử dụng **SendGrid** để gửi email payroll cho nhân viên vì:
- Mail server riêng (mail.thienphumut.vn) không cho phép gửi từ hosting
- SendGrid cung cấp free tier 100 emails/day
- Reliable delivery và tracking

---

## 🔑 BƯỚC 1: Tạo SendGrid Account & API Key

### 1.1. Đăng ký/Đăng nhập SendGrid

1. Truy cập: https://sendgrid.com/
2. Click **"Start for Free"** hoặc **"Sign In"**
3. Tạo account (free tier: 100 emails/day)

### 1.2. Tạo API Key

1. Sau khi đăng nhập, vào **Settings** > **API Keys**
   - URL: https://app.sendgrid.com/settings/api_keys

2. Click **"Create API Key"**

3. Cấu hình API Key:
   - **API Key Name**: `thienphumut-hr-production` (hoặc tên bạn muốn)
   - **API Key Permissions**: Chọn **"Full Access"**
     - Hoặc chọn **"Restricted Access"** và enable:
       - ✅ Mail Send (Full Access)
       - ✅ Stats (Read Access) - optional

4. Click **"Create & View"**

5. **QUAN TRỌNG**: Copy API Key ngay!
   - API Key có dạng: `SG.xxxxxxxxxxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyy`
   - Bạn chỉ thấy được 1 lần duy nhất!
   - Lưu vào file an toàn (sẽ dùng ở bước sau)

---

## ✉️ BƯỚC 2: Verify Sender Identity

SendGrid yêu cầu verify email/domain trước khi gửi.

### 2.1. Single Sender Verification (Khuyến nghị cho bắt đầu)

1. Vào **Settings** > **Sender Authentication** > **Single Sender Verification**
   - URL: https://app.sendgrid.com/settings/sender_auth/senders

2. Click **"Create New Sender"**

3. Điền thông tin:
   ```
   From Name: Thiên Phú Mút HR
   From Email Address: nhansu@thienphumut.vn
   Reply To: nhansu@thienphumut.vn
   Company Address: <địa chỉ công ty>
   City: <thành phố>
   Country: Vietnam
   ```

4. Click **"Create"**

5. **Kiểm tra email** `nhansu@thienphumut.vn`:
   - SendGrid sẽ gửi email verification
   - Click link trong email để verify

6. **Đợi verify thành công** (màu xanh ✅)

### 2.2. Domain Authentication (Nâng cao - Optional)

Nếu bạn muốn cải thiện deliverability:

1. Vào **Settings** > **Sender Authentication** > **Domain Authentication**
2. Click **"Authenticate Your Domain"**
3. Chọn DNS host (nơi quản lý domain thienphumut.vn)
4. Làm theo hướng dẫn thêm DNS records (CNAME, TXT)
5. Verify domain

---

## ⚙️ BƯỚC 3: Cấu Hình Backend Code

### 3.1. Kiểm tra package đã cài

```bash
cd D:\Congty\thienphumut\test\thienphumut-hr-backend
npm list @sendgrid/mail
```

Nếu chưa cài:
```bash
npm install @sendgrid/mail
```

### 3.2. Cập nhật file `.env` (Local Development)

Mở file `.env` và cập nhật:

```env
# SendGrid Configuration
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyy
SENDGRID_SENDER_EMAIL=nhansu@thienphumut.vn
MAIL_FROM_NAME=Thiên Phú Mút HR
```

**Thay thế**:
- `SG.xxxxxxx...` = API Key bạn vừa tạo ở Bước 1
- `nhansu@thienphumut.vn` = Email đã verify ở Bước 2

### 3.3. Code đã sẵn sàng

File `src/controllers/payrollBatchController_sendgrid.js` đã implement SendGrid:
- ✅ Dùng `@sendgrid/mail`
- ✅ Daily limit 80 emails
- ✅ Error handling & logging
- ✅ Email tracking in database

---

## 🚀 BƯỚC 4: Deploy lên Railway

### 4.1. Truy cập Railway Dashboard

1. Đăng nhập Railway: https://railway.app/
2. Chọn project **thienphumut-hr-backend**
3. Click tab **"Variables"**

### 4.2. Thêm Environment Variables

Click **"+ New Variable"** và thêm từng biến:

| Variable Name | Value | Ghi chú |
|---------------|-------|---------|
| `SENDGRID_API_KEY` | `SG.xxxxxxx...` | API Key từ Bước 1 |
| `SENDGRID_SENDER_EMAIL` | `nhansu@thienphumut.vn` | Email đã verify |
| `MAIL_FROM_NAME` | `Thiên Phú Mút HR` | Tên hiển thị |

### 4.3. Deploy

1. **Không cần redeploy thủ công** - Railway tự động deploy khi thay đổi env vars
2. Đợi deployment hoàn tất (xem tab "Deployments")
3. Kiểm tra logs (tab "Logs") không có error

---

## ✅ BƯỚC 5: Test SendGrid

### 5.1. Test qua API endpoint

Dùng Postman hoặc cURL:

```bash
curl -X POST https://thienphumut-hr-backend-production.up.railway.app/api/test-mail \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "to": "your-email@gmail.com",
    "subject": "Test SendGrid",
    "text": "This is a test email from SendGrid"
  }'
```

### 5.2. Test gửi payroll

1. Login vào frontend với admin account
2. Vào trang **Send Payroll**
3. Upload file `Overall-payroll.xlsx`
4. Click **"Gửi bảng lương cho tất cả nhân viên"**
5. Kiểm tra:
   - Console logs
   - Email inbox của nhân viên
   - SendGrid Activity Feed

---

## 📊 BƯỚC 6: Monitor Email Activity

### 6.1. SendGrid Dashboard

1. Vào **Activity Feed**:
   - URL: https://app.sendgrid.com/email_activity

2. Xem trạng thái email:
   - ✅ **Processed**: Email đã gửi
   - ✅ **Delivered**: Email đã đến inbox
   - ⚠️ **Bounced**: Email bị từ chối
   - ⚠️ **Blocked**: Email bị chặn

### 6.2. Database Logs

Kiểm tra bảng `email_logs` trong PostgreSQL:

```sql
SELECT * FROM email_logs
ORDER BY sent_at DESC
LIMIT 20;
```

---

## 🔧 Troubleshooting

### Issue 1: "Forbidden" Error

**Nguyên nhân**: API Key invalid hoặc sender email chưa verify

**Giải pháp**:
1. Kiểm tra API Key đúng format `SG.xxx.yyy`
2. Kiểm tra sender email đã verify (màu xanh)
3. Xem SendGrid Activity Feed để biết lỗi cụ thể

### Issue 2: Email vào Spam

**Nguyên nhân**: Domain chưa authenticate

**Giải pháp**:
1. Setup Domain Authentication (Bước 2.2)
2. Thêm SPF, DKIM records
3. Tránh nội dung spam (quá nhiều link, từ ngữ marketing)

### Issue 3: Daily Limit Reached

**Nguyên nhân**: Đã gửi 80 emails trong ngày (code limit)

**Giải pháp**:
1. Đợi sang ngày mới (reset 00:00 UTC)
2. Hoặc tăng limit trong code:
   ```javascript
   // File: payrollBatchController_sendgrid.js
   const DAILY_EMAIL_LIMIT = 100; // Thay đổi tại đây
   ```

### Issue 4: SendGrid Free Tier hết quota

**Nguyên nhân**: SendGrid free plan: 100 emails/day

**Giải pháp**:
1. Upgrade SendGrid plan (từ $19.95/month)
2. Hoặc chia nhỏ batch gửi trong nhiều ngày

---

## 📝 Email Limits Summary

| Service | Daily Limit | Monthly Limit |
|---------|-------------|---------------|
| SendGrid Free | 100 emails | 3,000 emails |
| Code Hard Limit | 80 emails | 2,400 emails (ước tính) |

**Lý do code limit 80**: Để dự phòng, tránh vượt quota SendGrid

---

## 🔒 Security Best Practices

1. **KHÔNG commit** API Key vào Git
2. **Sử dụng** Railway environment variables cho production
3. **Rotate** API Key định kỳ (3-6 tháng)
4. **Monitor** Activity Feed để phát hiện bất thường
5. **Enable** 2FA cho SendGrid account

---

## 📞 Support

Nếu gặp vấn đề:
1. Kiểm tra SendGrid Activity Feed
2. Kiểm tra Railway Logs
3. Kiểm tra database `email_logs`
4. Liên hệ SendGrid Support (nếu cần)

---

**Lưu ý**: Hướng dẫn này được tạo cho Thiên Phú Mút HR System.
Cập nhật lần cuối: 2026-01-14
