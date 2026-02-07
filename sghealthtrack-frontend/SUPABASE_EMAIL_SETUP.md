# Supabase Email Confirmation Setup

If users don't receive the signup confirmation email, check the following in your **Supabase Dashboard**:

## 1. Enable "Confirm email"

- Go to **Authentication** → **Providers** → **Email**
- Turn **ON** "Confirm email"
- Save

## 2. Allow redirect URL

- Go to **Authentication** → **URL Configuration**
- Under **Redirect URLs**, add:
  - `http://localhost:5173/auth/callback` (for local dev)
  - `https://your-production-domain.com/auth/callback` (when deployed)
- **Site URL** should be your app’s origin (e.g. `http://localhost:5173` in dev)

## 3. Check email templates

- Go to **Authentication** → **Email Templates**
- Open **Confirm signup**
- Ensure the template is enabled and the "Confirmation link" uses `{{ .ConfirmationURL }}`

## 4. Check rate limits and spam

- Supabase’s built-in sender has limits; emails can be delayed or go to spam
- Check **Authentication** → **Users**: the new user should appear as unconfirmed until they click the link
- For testing, you can **Confirm** a user manually in that table

## 5. Custom SMTP (optional)

- For more reliable delivery, set **Project Settings** → **Auth** → **SMTP** and use your own SMTP (SendGrid, Resend, etc.)

After changing any of these, try signup again with a new email address.
