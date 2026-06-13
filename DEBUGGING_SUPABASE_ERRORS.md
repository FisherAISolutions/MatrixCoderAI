# Supabase Error Debugging Guide

## Problem

You're seeing errors like:
```
Error: saveFile error: {}
Error: loadSessionMessages error: {}
Error: loadSessionFiles error: {}
```

This means Supabase operations are failing but the exact error isn't being displayed. This guide helps diagnose the root cause.

## Step 1: Check Browser Console

Open the browser developer tools (F12) and go to the **Console** tab. Look for these log messages:

```
[✓] Auth init - currentUser: <email>           ← Your email if logged in
[✓] Loading sessions for user: <uuid>          ← User ID
[✓] Loaded sessions: 1                         ← Number of sessions
[✓] Loading session data: <session-uuid>       ← Which session is loading
[✓] Fetching messages from DB...               ← Trying to load messages
[!] Saved message successfully                 ← Message persistence working
[!] Saving file to DB: ...                     ← File save attempt
```

If you see **"not logged in"** or missing session IDs, go to **Step 2**.

If you see **"Fetching messages from DB..."** but then **empty error objects `{}`**, go to **Step 3**.

## Step 2: Verify Authentication

1. **Check if you're logged in**: Look at the top-right corner of the app
   - Should see an email/avatar
   - If not, you're in demo mode

2. **Try signing up again**:
   - Create a new account with a test email: `test+<random>@example.com`
   - The app should redirect to chat workspace
   - Check browser console for `Auth init - currentUser: test+...@example.com`

3. **If signup fails**: Check the browser console for auth errors like `"Invalid login credentials"` or network errors

## Step 3: Verify Supabase Tables Exist

1. **Go to Supabase Dashboard**: https://app.supabase.com
2. **Select your project**
3. **Go to "SQL Editor"** in the left sidebar
4. **Create a new query** and paste this:

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';
```

5. **Run the query** (keyboard: Ctrl+Enter)

**Expected output**: 4 tables:
- `users` (or `auth.users`)
- `sessions`
- `chat_messages`
- `files`

**If tables missing**: Run `setup-supabase.sql` in the SQL Editor:
1. Create a new query
2. Paste the entire contents of `setup-supabase.sql` (from project root)
3. Run it (Ctrl+Enter)
4. Refresh the app

## Step 4: Check RLS Policies

Row-Level Security (RLS) policies control who can read/write. If policies are wrong, all queries fail silently.

1. **In Supabase Dashboard**, go to **"Authentication"** → **"Policies"**
2. **For each table** (`sessions`, `chat_messages`, `files`):
   - Click the table name
   - Should see policies like:
     - `Users can view own sessions` (SELECT)
     - `Users can insert own messages` (INSERT)
     - `Users can update own files` (UPDATE)
     - `Users can delete own files` (DELETE)

3. **If policies look wrong or missing**:
   - Run `setup-supabase.sql` again (it creates all policies)
   - OR manually recreate them following the schema in the file

## Step 5: Verify Session is Created

1. **In Supabase Dashboard**, go to **"Table Editor"**
2. **Select "sessions" table**
3. **Should see at least 1 row** with:
   - `user_id`: Your user ID
   - `title`: "Main Workspace"
   - `created_at`: Recent timestamp

**If no sessions**: Means signup succeeded but session creation failed
- Check `chat_messages` table - if empty, DB writes are working
- If `chat_messages` has data but `sessions` is empty, there's a specific issue with session creation

## Step 6: Test Database Connection

1. **In Supabase Dashboard**, go to **"SQL Editor"**
2. **Run this query** to verify auth is working:

```sql
SELECT auth.uid() as current_user;
```

**Expected output**: A UUID (your user ID)

**If NULL**: Auth context is broken - the API is treating you as unauthenticated

3. **Test session query**:

```sql
SELECT * FROM sessions WHERE user_id = auth.uid();
```

**Expected output**: At least 1 row

**If 0 rows**: No sessions exist for this user

## Step 7: Common Causes & Fixes

| Issue | Symptoms | Fix |
|-------|----------|-----|
| **Tables don't exist** | `relation "sessions" does not exist` in console | Run `setup-supabase.sql` |
| **RLS policies blocking** | Empty error objects `{}` | Verify policies in Step 4 or run `setup-supabase.sql` |
| **User not authenticated** | See "not logged in" in console | Signup again or check auth errors |
| **Wrong Supabase project** | All queries fail | Verify `.env` has correct `NEXT_PUBLIC_SUPABASE_URL` |
| **Demo session active** | Messages don't save, but app works | Logout and login with real credentials |
| **Invalid session ID** | Messages/files don't load | Check browser console for session ID format |

## Step 8: Enable Query Logging (Advanced)

**In Supabase Dashboard**:

1. Go to **"Logs"** → **"Postgres Logs"**
2. Look for queries starting with `INSERT`, `SELECT`, `UPDATE`
3. Check for errors like:
   - `permission denied for table "sessions"`
   - `invalid UUID` format
   - `duplicate key value violates unique constraint`

These indicate exactly what went wrong.

## What Should Work

If everything is set up correctly:

1. **Sign up** → User created + session auto-created
2. **Send message** → Console shows `[✓] Saved message successfully`
3. **Ask for code** → Console shows `[✓] File saved successfully`
4. **Refresh page** → All messages + files restore

## Still Not Working?

1. **Check `.env` file** in project root:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
   - Both must be set and valid
   - If changed, restart dev server: `npm run dev`

2. **Clear browser cache** (Ctrl+Shift+Delete) and reload

3. **Check terminal output** where `npm run dev` is running:
   - Look for errors starting with `Error:` or `POST` status codes like `400`, `401`, `403`
   - `401` = authentication failed
   - `403` = permission denied (RLS policy)

4. **Restart dev server**:
   ```bash
   Ctrl+C to stop npm run dev
   npm run dev to restart
   ```

## Need More Help?

1. **Check Supabase Logs**: Dashboard → Logs → Postgres Logs → Filter by your queries
2. **Check Network Tab**: Browser F12 → Network → look for failed requests to supabase.co
3. **Create a fresh Supabase project** and try again
4. **Contact Supabase Support**: Dashboard → Help → Support

---

**Last Updated**: May 2026  
**Version**: 1.0.0
