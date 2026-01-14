# Brevo Setup Guide - Thiên Phú Mút HR

## 📋 Tổng Quan

Project sử dụng **Brevo** (formerly Sendinblue) để gửi email payroll cho nhân viên vì:
- Mail server riêng (mail.thienphumut.vn) không cho phép gửi từ hosting
- Brevo cung cấp free tier 300 emails/day
- API đơn giản và reliable delivery
- Tracking và monitoring tốt

---

## 🔑 BƯỚC 1: Tạo Brevo Account & API Key

### 1.1. Đăng ký/Đăng nhập Brevo

1. Truy cập: https://www.brevo.com/
2. Click **"Sign Up Free"** hoặc **"Log In"**
3. Tạo account (free tier: 300 emails/day)

### 1.2. Lấy API Key

1. Sau khi đăng nhập, vào **Settings** (góc phải trên) > **SMTP & API**
   - URL trực tiếp: https://app.brevo.com/settings/keys/api

2. Trong tab **API Keys**, bạn sẽ thấy API Key hiện tại hoặc tạo mới:
   - Click **"Generate a new API Key"** (nếu chưa có)
   - Đặt tên: `thienphumut-hr-production`

3. **QUAN TRỌNG**: Copy API Key ngay!
   - API Key có dạng: `xkeyxxx-xxxxxxxxxxxxxxxxxxxx`
   - Ví dụ: `1bOCnEkKHrZqBp4c`
   - Lưu vào file an toàn (sẽ dùng ở bước sau)

### 1.3. Kiểm tra SMTP Credentials (Optional)

Nếu bạn muốn dùng SMTP thay vì API:
1. Vào tab **SMTP**
2. Copy thông tin:
   ```
   SMTP Server: smtp-relay.brevo.com
   Port: 587 (TLS) hoặc 465 (SSL)
   Login: <your-brevo-email>
   Password: <SMTP key>
   ```

**Lưu ý**: Project hiện tại sử dụng **Brevo API** (không phải SMTP) để dễ tracking và error handling.

---

## ✉️ BƯỚC 2: Verify Sender Email

Brevo yêu cầu verify email trước khi gửi.

### 2.1. Add Sender Email

1. Vào **Senders** > **Senders & IP**
   - URL: https://app.brevo.com/senders

2. Click **"Add a Sender"**

3. Điền thông tin:
   ```
   Email Address: nhansu@thienphumut.vn
   From Name: Thiên Phú Mút HR
   ```

4. Click **"Send Verification Email"**

5. **Kiểm tra email** `nhansu@thienphumut.vn`:
   - Brevo sẽ gửi email verification
   - Click link trong email để verify

6. **Đợi verify thành công** (status "Verified" với icon xanh ✅)

### 2.2. Domain Authentication (Optional - Nâng cao)

Để cải thiện deliverability và tránh email vào spam:

1. Vào **Senders** > **Domains**
2. Click **"Authenticate a new domain"**
3. Nhập domain: `thienphumut.vn`
4. Làm theo hướng dẫn thêm DNS records:
   - SPF record
   - DKIM record
   - DMARC record (optional)
5. Verify domain sau khi đã thêm DNS records

**Lưu ý**: Domain authentication không bắt buộc nhưng giúp:
- Email ít bị spam hơn
- Tăng trust score
- Có thể gửi từ bất kỳ email @thienphumut.vn nào

---

## ⚙️ BƯỚC 3: Cấu Hình Backend Code

### 3.1. Kiểm tra package đã cài

```bash
cd D:\Congty\thienphumut\test\thienphumut-hr-backend
npm list @getbrevo/brevo
```

Nếu chưa cài:
```bash
npm install @getbrevo/brevo
```

### 3.2. Cập nhật file `.env` (Local Development)

Mở file `.env` và thêm/cập nhật:

```env
# Brevo Configuration (Current Email Provider)
BREVO_API_KEY=1bOCnEkKHrZqBp4c
BREVO_SENDER_EMAIL=nhansu@thienphumut.vn
MAIL_FROM_NAME=Thiên Phú Mút HR
```

**Thay thế**:
- `1bOCnEkKHrZqBp4c` = API Key bạn vừa tạo ở Bước 1
- `nhansu@thienphumut.vn` = Email đã verify ở Bước 2

### 3.3. Code đã sẵn sàng

File `src/controllers/payrollBatchController_brevo.js` đã implement Brevo:
- ✅ Dùng `@getbrevo/brevo` SDK
- ✅ Daily limit 300 emails
- ✅ Error handling & logging
- ✅ Email tracking in database
- ✅ Base64 attachment encoding
- ✅ SSE progress updates

File `src/routes/payrollRoutes.js` đã được cập nhật để dùng Brevo controller.

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
| `BREVO_API_KEY` | `1bOCnEkKHrZqBp4c` | API Key từ Bước 1 |
| `BREVO_SENDER_EMAIL` | `nhansu@thienphumut.vn` | Email đã verify |
| `MAIL_FROM_NAME` | `Thiên Phú Mút HR` | Tên hiển thị |

**Lưu ý**: Nếu các biến `SENDGRID_*` hoặc `MAIL_HOST` còn tồn tại, bạn có thể giữ lại (không ảnh hưởng) hoặc xóa đi.

### 4.3. Deploy

1. **Không cần redeploy thủ công** - Railway tự động deploy khi thay đổi env vars
2. Đợi deployment hoàn tất (xem tab "Deployments")
3. Kiểm tra logs (tab "Logs") không có error:
   ```
   ✅ Brevo API initialized
   🚀 Server running in production mode on port 5000
   ```

### 4.4. Commit & Push Code (Nếu chưa)

Nếu bạn chưa push code Brevo lên Git:

```bash
git add .
git commit -m "Switch to Brevo for email sending"
git push origin main
```

Railway sẽ tự động deploy sau khi detect git push.

---

## ✅ BƯỚC 5: Test Brevo

### 5.1. Test Local (Development)

1. Khởi động server local:
   ```bash
   npm run dev
   ```

2. Đảm bảo `.env` có đủ thông tin Brevo

3. Test gửi payroll qua frontend hoặc Postman:
   ```bash
   curl -X POST http://localhost:5000/api/payroll/batch-send \
     -H "Content-Type: multipart/form-data" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -F "overallPayroll=@temp-peyroll-form/Overall-payroll.xlsx"
   ```

### 5.2. Test Production (Railway)

1. Login vào frontend với admin account
2. Vào trang **Send Payroll**
3. Upload file `Overall-payroll.xlsx`
4. Click **"Gửi bảng lương cho tất cả nhân viên"**
5. Kiểm tra:
   - Console logs
   - Progress bar hiển thị realtime
   - Email inbox của nhân viên
   - Brevo Dashboard

### 5.3. Kiểm tra Email đã gửi

1. Check inbox của nhân viên test
2. Kiểm tra file đính kèm `payroll-<employee_id>.xlsx`
3. Xem header "From": phải là `Thiên Phú Mút HR <nhansu@thienphumut.vn>`

---

## 📊 BƯỚC 6: Monitor Email Activity

### 6.1. Brevo Dashboard

1. Vào **Statistics** > **Email**:
   - URL: https://app.brevo.com/statistics/email

2. Xem trạng thái email:
   - ✅ **Sent**: Email đã gửi
   - ✅ **Delivered**: Email đã đến inbox
   - 📬 **Opened**: Email đã được mở (nếu enable tracking)
   - ⚠️ **Soft Bounce**: Lỗi tạm thời
   - ❌ **Hard Bounce**: Email không tồn tại
   - 🚫 **Blocked**: Email bị chặn

3. Xem chi tiết từng email:
   - Vào **Logs** > **Email Logs**
   - URL: https://app.brevo.com/logs/email
   - Search theo recipient email

### 6.2. Database Logs

Kiểm tra bảng `email_logs` trong PostgreSQL:

```sql
SELECT
    employee_id,
    recipient_email,
    status,
    sent_at,
    error_message
FROM email_logs
ORDER BY sent_at DESC
LIMIT 20;
```

### 6.3. Check Daily Quota

Kiểm tra số email đã gửi trong ngày:

```sql
SELECT COUNT(*) as emails_sent_today
FROM email_logs
WHERE sent_at::date = CURRENT_DATE
AND status = 'sent';
```

Code tự động check limit 300 emails/day.

---

## 🔧 Troubleshooting

### Issue 1: "Invalid API Key" Error

**Nguyên nhân**: API Key sai hoặc không có quyền

**Giải pháp**:
1. Kiểm tra API Key trong `.env` hoặc Railway env vars
2. Đảm bảo không có khoảng trắng thừa
3. Tạo API Key mới từ Brevo Dashboard
4. Restart server sau khi đổi env vars

### Issue 2: "Sender email not verified" Error

**Nguyên nhân**: Email `nhansu@thienphumut.vn` chưa verify

**Giải pháp**:
1. Vào Brevo Dashboard > Senders
2. Kiểm tra status của `nhansu@thienphumut.vn`
3. Nếu chưa verify, click "Resend verification email"
4. Check inbox và click link verify

### Issue 3: Email vào Spam

**Nguyên nhân**: Domain chưa authenticate hoặc nội dung email suspect

**Giải pháp**:
1. Setup Domain Authentication (Bước 2.2)
2. Thêm SPF, DKIM records vào DNS
3. Tránh nội dung spam:
   - Không dùng quá nhiều từ viết hoa
   - Không dùng từ ngữ marketing spam
   - Subject line rõ ràng, professional
4. Request recipients whitelist email `nhansu@thienphumut.vn`

### Issue 4: Daily Limit Reached

**Nguyên nhân**: Đã gửi 300 emails trong ngày

**Giải pháp**:
1. Đợi sang ngày mới (reset 00:00 UTC+7)
2. Hoặc tăng limit trong code:
   ```javascript
   // File: payrollBatchController_brevo.js:15
   const DAILY_EMAIL_LIMIT = 300; // Thay đổi tại đây (nhưng Brevo free vẫn limit 300)
   ```
3. Hoặc upgrade Brevo plan:
   - Lite Plan: $25/month - 20,000 emails/month
   - Business Plan: $65/month - 100,000 emails/month

### Issue 5: Attachment không mở được

**Nguyên nhân**: Base64 encoding bị lỗi hoặc file corrupt

**Giải pháp**:
1. Kiểm tra file Excel template `peyroll-form/payroll-1.xlsx` không bị corrupt
2. Test locally trước khi deploy
3. Kiểm tra logs xem có error khi generate Excel không
4. Download attachment và test file có mở được không

### Issue 6: "Network Error" khi gửi

**Nguyên nhân**: Brevo API timeout hoặc network issue

**Giải pháp**:
1. Kiểm tra internet connection
2. Kiểm tra Railway logs xem có error không
3. Retry gửi lại (code có auto-retry logic)
4. Check Brevo API status: https://status.brevo.com/

---

## 📝 Email Limits Summary

| Service | Daily Limit | Monthly Limit | Cost |
|---------|-------------|---------------|------|
| Brevo Free | 300 emails | 9,000 emails | Free |
| Code Hard Limit | 300 emails | 9,000 emails (ước tính) | Free |
| Brevo Lite | 667 emails | 20,000 emails | $25/month |
| Brevo Business | 3,333 emails | 100,000 emails | $65/month |

**Lý do code limit 300**: Match với Brevo free tier để tránh vượt quota.

---

## 🔒 Security Best Practices

1. **KHÔNG commit** API Key vào Git
   ```bash
   # Đảm bảo .env trong .gitignore
   echo ".env" >> .gitignore
   ```

2. **Sử dụng** Railway environment variables cho production

3. **Rotate** API Key định kỳ (3-6 tháng)
   - Tạo API Key mới
   - Update Railway env vars
   - Deploy
   - Xóa API Key cũ

4. **Monitor** Brevo Logs để phát hiện bất thường:
   - Spike số email gửi đột ngột
   - Bounce rate cao
   - Spam reports

5. **Enable** 2FA cho Brevo account:
   - Vào Settings > Account Security
   - Enable Two-Factor Authentication

6. **Restrict** API Key permissions (nếu có):
   - Chỉ enable "Send emails" permission
   - Disable các permissions không cần thiết

---

## 📊 Code Architecture

### File Structure

```
src/
├── controllers/
│   ├── payrollBatchController.js          # Nodemailer (deprecated)
│   ├── payrollBatchController_sendgrid.js # SendGrid (deprecated)
│   └── payrollBatchController_brevo.js    # Brevo (CURRENT)
├── routes/
│   └── payrollRoutes.js                   # Routes sử dụng Brevo
└── utils/
    └── email.js                            # Email utilities (nếu có)
```

### Brevo Controller Flow

```javascript
1. Upload Overall-payroll.xlsx
2. Parse Excel file → extract employee data
3. For each employee:
   a. Generate individual payroll-<id>.xlsx
   b. Map 31 fields (days + currency format)
   c. Convert to base64 for attachment
   d. Send via Brevo API
   e. Log to database (email_logs)
   f. Send SSE progress to frontend
4. Return summary (success/failed counts)
```

### Key Functions

**generateAndSendBatchPayroll** (main function):
- Handles file upload
- Checks daily email limit
- Orchestrates batch sending
- SSE progress updates

**sendPayrollEmail** (Brevo sending):
```javascript
const sendSmtpEmail = new brevo.SendSmtpEmail();
sendSmtpEmail.subject = `[TPM] Bảng Lương Tháng ${periodMonth}`;
sendSmtpEmail.to = [{ email, name }];
sendSmtpEmail.sender = { name, email };
sendSmtpEmail.htmlContent = `<html>...</html>`;
sendSmtpEmail.attachment = [{ content: base64, name }];

await apiInstance.sendTransacEmail(sendSmtpEmail);
```

---

## 🆚 Comparison: Brevo vs SendGrid vs Nodemailer

| Feature | Brevo | SendGrid | Nodemailer |
|---------|-------|----------|------------|
| Free Tier | 300/day | 100/day | Unlimited* |
| Setup Complexity | Medium | Medium | Low |
| API Quality | Good | Excellent | N/A |
| Tracking | Good | Excellent | Manual |
| Deliverability | Good | Excellent | Depends on SMTP |
| Cost | $25-65/mo | $19.95+/mo | Free |
| Thienphumut Support | ✅ YES | ❌ No | ❌ No (host blocked) |

*Nodemailer free nhưng thienphumut.vn mail server bị block từ hosting

**Kết luận**: Brevo là lựa chọn tốt nhất cho Thiên Phú Mút vì:
- Free tier hào phóng hơn SendGrid (300 vs 100)
- API đơn giản, dễ implement
- Cost-effective khi scale up
- Support tốt

---

## 📞 Support

Nếu gặp vấn đề:

1. **Kiểm tra Brevo Dashboard**:
   - Email Logs: https://app.brevo.com/logs/email
   - API Status: https://status.brevo.com/

2. **Kiểm tra Railway Logs**:
   - Vào project > Logs tab
   - Search error messages

3. **Kiểm tra Database**:
   ```sql
   SELECT * FROM email_logs
   WHERE status = 'failed'
   ORDER BY sent_at DESC;
   ```

4. **Contact Brevo Support**:
   - Dashboard > Help Center
   - Email: support@brevo.com
   - Chat support (trong dashboard)

5. **Debug Local**:
   ```bash
   # Enable debug logs
   DEBUG=brevo:* npm run dev
   ```

---

## 🎯 Quick Reference

### Environment Variables Checklist

```env
✅ BREVO_API_KEY=1bOCnEkKHrZqBp4c
✅ BREVO_SENDER_EMAIL=nhansu@thienphumut.vn
✅ MAIL_FROM_NAME=Thiên Phú Mút HR
```

### Railway Deploy Checklist

- ✅ Add BREVO_API_KEY to Railway env vars
- ✅ Add BREVO_SENDER_EMAIL to Railway env vars
- ✅ Add MAIL_FROM_NAME to Railway env vars
- ✅ Push code to Git (nếu chưa)
- ✅ Verify deployment success
- ✅ Check logs không có error
- ✅ Test gửi email từ production

### Testing Checklist

- ✅ Sender email verified trên Brevo
- ✅ API Key valid và có permissions
- ✅ Local test thành công
- ✅ Production test thành công
- ✅ Email delivered đến inbox (không spam)
- ✅ Attachment mở được
- ✅ Database logs ghi nhận đúng

---

**Lưu ý**: Hướng dẫn này được tạo cho Thiên Phú Mút HR System.
Cập nhật lần cuối: 2026-01-14

**Version**: 1.0.0
**Author**: Thiên Phú Mút Dev Team
**Contact**: nhansu@thienphumut.vn
