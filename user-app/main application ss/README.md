Place step screenshots for the login tutorial in this folder.

Filenames the tutorial expects (one image per step):

- `sign in01.png` — Sign In
- `sign up02.png` — Create account (Sign Up)
- `verification05.png` — Verify email
- `recover03.png` — Recover password

How to add the screenshots:

1. Use these filenames for the corresponding tutorial steps.
2. Copy them into `user-app/main application ss/`.

Example (PowerShell):

```powershell
# from the folder containing your screenshots
Copy-Item .\step1.png -Destination .\user-app\"main application ss"\step1.png
Copy-Item .\step2.png -Destination .\user-app\"main application ss"\step2.png
Copy-Item .\step3.png -Destination .\user-app\"main application ss"\step3.png
Copy-Item .\step4.png -Destination .\user-app\"main application ss"\step4.png
```

Or using Command Prompt:

```cmd
copy step1.png "user-app\main application ss\step1.png"
copy step2.png "user-app\main application ss\step2.png"
copy step3.png "user-app\main application ss\step3.png"
copy step4.png "user-app\main application ss\step4.png"
```

After placing the files, open `user-app/login.html` and click the three-dot tutorial button — each step will show its screenshot and instructions.