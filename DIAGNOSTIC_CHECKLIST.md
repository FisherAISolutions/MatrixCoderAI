# CodePilot - Quick Diagnostic Checklist

Use this checklist to identify why Supabase operations are failing.

## Pre-Requisites

- [ ] Supabase project created at supabase.com
- [ ] Database tables created (ran `setup-supabase.sql`)
- [ ] `.env` file has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `npm run dev` is running without errors
- [ ] App loads at http://localhost:3000

## Authentication Check

1. **Open browser DevTools** (F12 → Console tab)
2. **Look for** `Auth init - currentUser: <email>`
   - [ ] If you see your email → **Auth is working** ✅
   - [ ] If you see "not logged in" → Go to **Auth Issues** section below
   - [ ] If you see NO auth log → Page didn't load properly, refresh

## Session Check

1. **In the same console**, look for:
   - [ ] `Loaded sessions: 1` (or higher) → Sessions exist ✅
   - [ ] `Loaded sessions: 0` → Go to **Session Creation** section
   - [ ] `Database connection issue - using demo session` → DB unavailable

2. **Verify session ID**:
   - Look for `Loading session data: <uuid-here>`
   - [ ] If starts with `demo-` → You're in demo mode (not persisting)
   - [ ] If looks like UUID → Real session ✅

## Data Persistence Check

1. **After you send a message**, look for:
   - [ ] `Saving message to DB: ...` → Attempting save
   - [ ] `Message saved successfully` → **Data persists** ✅
   - [ ] `Message save returned null` → DB unavailable but app works
   - [ ] Nothing appears → Message save wasn't attempted (check Session ID above)

2. **After code generation**, look for:
   - [ ] `Saving file to DB: ...` → Attempting save
   - [ ] `File saved successfully: src/...` → **File persists** ✅
   - [ ] Error message with actual error → Go to **File Save Errors** section

## Reload Test

1. **Generate some files/messages**
2. **Refresh the page** (Ctrl+R or Cmd+R)
3. **Check if data restored**:
   - [ ] Messages appear → **Persistence working** ✅
   - [ ] Files in sidebar → **Persistence working** ✅
   - [ ] Everything empty → Go to **Data Loading Errors** section

---

## If Something Failed ⚠️

### Auth Issues

**Symptoms**: 
- Console shows "not logged in"
- Can't create account
- Signup redirects back to login screen

**Fix**:
1. **Check Supabase Auth is enabled**:
   - Supabase Dashboard → Authentication → Providers
   - [ ] Email/Password should be enabled (green toggle)

2. **Try again**:
   - Sign out (top-right menu)
   - Try new account: `test+<random>@example.com`
   - Check console for errors

3. **If still fails**:
   - Check `.env` variables are correct
   - Restart dev server: `npm run dev`
   - Try incognito/private window

### Session Creation

**Symptoms**:
- Logged in but console shows "Loaded sessions: 0"
- Database connection issue message

**Fix**:
1. **Verify sessions table exists**:
   - Supabase Dashboard → Table Editor
   - [ ] See "sessions" table in list

2. **If sessions table missing**:
   - Go to SQL Editor
   - Paste all of `setup-supabase.sql`
   - Run (Ctrl+Enter)
   - Refresh app

3. **If sessions table exists**:
   - Check RLS policy (next section)

### RLS Policy Issues

**Symptoms**:
- Console shows empty error objects `{}`
- "Database connection issue" but .env looks correct
- Tables exist but queries fail

**Fix**:
1. **Verify RLS policies exist**:
   - Supabase Dashboard → Authentication → Policies
   - For each table (sessions, chat_messages, files):
     - [ ] SELECT policy exists
     - [ ] INSERT policy exists
     - [ ] UPDATE policy exists (for updates)
     - [ ] DELETE policy exists (for deletes)

2. **If policies missing**:
   - Run `setup-supabase.sql` again in SQL Editor
   - It creates all required policies

3. **If policies exist but still failing**:
   - Double-check the policy conditions
   - They should check `auth.uid()` == `user_id`
   - Go to DEBUGGING_SUPABASE_ERRORS.md for advanced checks

### File Save Errors

**Symptoms**:
- Console shows: `Failed to save file: <error message>`
- Files appear in app but don't persist after reload

**Fix**:
1. **Read the error message** - it will tell you what's wrong
2. **Common messages**:
   - `"permission denied for table \"files\""` → RLS policy issue
   - `"relation \"files\" does not exist"` → Tables missing
   - `"invalid input syntax for type uuid"` → Session ID format wrong

3. **For each error**, follow the solutions in DEBUGGING_SUPABASE_ERRORS.md

### Data Loading Errors

**Symptoms**:
- Messages/files don't load after page reload
- Console shows: `Could not load messages (DB connection issue)`

**Fix**:
1. **Check network connection**: Is the browser online?
2. **Check Supabase status**: Is supabase.co up? (check status.supabase.com)
3. **Verify auth user**:
   - In Supabase Dashboard → SQL Editor
   - Run: `SELECT auth.uid();`
   - [ ] Should return a UUID (not NULL)
4. **Verify data exists**:
   - Supabase Dashboard → Table Editor
   - Click "chat_messages" table
   - [ ] Should see rows you created

---

## Full Diagnostic (If Still Stuck)

### Step 1: Verify Environment

```bash
# In project folder, check .env file exists
cat .env
# Should show: NEXT_PUBLIC_SUPABASE_URL=...
#             NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### Step 2: Check Database Connection

1. Go to Supabase Dashboard → SQL Editor
2. Run this query:
```sql
SELECT 
  auth.uid() as user_id,
  current_user as db_user,
  current_timestamp as time
```
Expected: UUID in first column

### Step 3: Check Tables

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```
Expected: sessions, chat_messages, files

### Step 4: Check Policies

```sql
SELECT table_name, policy_name 
FROM pg_policies 
WHERE schema_name = 'public'
ORDER BY table_name;
```
Expected: Multiple rows per table

### Step 5: Check Session Data

```sql
SELECT id, user_id, title 
FROM sessions 
WHERE user_id = auth.uid()
LIMIT 1;
```
Expected: At least 1 row

### Step 6: Browser Network Tab

1. Open DevTools → Network tab
2. Do an action (send message, create file)
3. Look for requests to `supabase.co`
   - [ ] Status should be `200` or `201` for success
   - [ ] Status `400` = bad request (check error message)
   - [ ] Status `401` = auth error (check credentials)
   - [ ] Status `403` = RLS policy blocked
   - [ ] Status `500` = server error

---

## Success Indicators

When everything works correctly, you should see:

```
✅ Auth init - currentUser: your@email.com
✅ Loaded sessions: 1
✅ Loading session data: uuid-uuid-uuid-uuid
✅ Loaded 0 messages (first time)
✅ Loaded 0 files (first time)
✅ Saving message to DB: ...
✅ Message saved successfully
✅ Saving file to DB: { sessionId: ..., path: src/... }
✅ File saved successfully: src/filename.tsx
[After reload]
✅ Loaded 5 messages
✅ Loaded 3 files
```

---

**Still stuck?** Check DEBUGGING_SUPABASE_ERRORS.md for deeper diagnostic steps.
