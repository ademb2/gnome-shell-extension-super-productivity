# Super Productivity Indicator

A minimal GNOME Shell extension that displays your current task and time spent today in the top panel.

- Appears when you start a task
- Disappears when you stop or complete a task
- Tested only on Ubuntu 26.04 LTS (GNOME 50)

## Requirements

- Super Productivity app installed with REST API enabled: **Settings → General → Misc → Enable REST API**


## Install

1-Line Setup Command:

```bash
TOKEN="YOUR_TOKEN_HERE" && git clone https://github.com/ademb2/gnome-shell-extension-super-productivity.git ~/.local/share/gnome-shell/extensions/indicator@superproductivity.app && echo "$TOKEN" > ~/.local/share/gnome-shell/extensions/indicator@superproductivity.app/token.txt && gnome-extensions enable indicator@superproductivity.app
```

This clones the extension, writes your Super Productivity REST API access token to `token.txt`, and enables the extension.

## Screenshot

![Screenshot](screenshot.png)