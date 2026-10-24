# Connect a local AI model on Windows (Ollama)

Run the AI on your own Windows computer, free and private: no account, no API key, and questions never leave the machine. The app sends the model only the Sunshine rules it looked up, so even a small model gives grounded answers.

Two ways to use it:

- **On the computer itself** (Part A): the app in Chrome on the same Windows computer talks to Ollama directly. Quickest to set up.
- **On phones in the room** (Part B): the computer runs the app's small server, and phones on the same Wi-Fi use it as the *League server*.

Tested on a Surface Laptop Studio (11th-gen Intel i7, 32 GB RAM, NVIDIA RTX A2000 Laptop 4 GB) with `llama3.2:3b`.

---

## 1. Pick a model for your computer

Check your hardware first: **Task Manager → Performance**. Note the RAM (Memory) and whether there is an NVIDIA or AMD **GPU** and how much "Dedicated GPU memory" it has.

| Your computer | Model to pull | Download | Notes |
|---|---|---|---|
| **Recommended for most laptops** (any GPU with 4 GB, or 16 GB+ RAM) | `llama3.2:3b` | about 2.0 GB | Reliable structured answers; the one we demo with. |
| Older or low-power laptop, no GPU, 8 GB RAM | `llama3.2:1b` | about 1.3 GB | Fast on the processor; plainer wording. |
| Alternative small model | `qwen2.5:3b` | about 1.9 GB | Good at following the answer format. |
| GPU with 6 GB+, or 32 GB RAM and patience | `gemma3:4b` | about 3.3 GB | Warmer, more natural wording. Just fits a 4 GB GPU with the tweaks in step 7. |
| GPU with 8 GB+ | `llama3.1:8b` | about 4.9 GB | Noticeably better writing; slow without a GPU. |
| GPU with 12 GB+ | `gemma3:12b` | about 8 GB | Best quality that is practical locally. |

Sizes are approximate. Rules of thumb:

- The model should fit in your **GPU memory** (or in about half your RAM if there is no GPU), with room to spare.
- **Avoid "reasoning" models** (names with `r1`, `think`, or `qwen3`) for this app. They are slower and can add thinking text before the answer, which the app then has to throw away.
- Bigger is not always better here: the app's answers come from the rules it looks up, so a 3B model is plenty for the demo.

---

## 2. Install Ollama

In **PowerShell** (Start → type "PowerShell"):

```powershell
irm https://ollama.com/install.ps1 | iex
```

Or download the installer from https://ollama.com/download/windows. Ollama starts automatically and shows a llama icon in the system tray (bottom right, near the clock; it may be hidden under the `^` arrow).

## 3. Download the model

```powershell
ollama pull llama3.2:3b
```

Swap in the model you picked in step 1.

## 4. Check it runs, and where

```powershell
ollama run llama3.2:3b "In one sentence, what is a dropped third strike?"
ollama ps
```

`ollama ps` shows a **PROCESSOR** column:

- `100% GPU`: best.
- A split like `20%/80% CPU/GPU`: fine; a little of the model spilled onto the processor. Step 7 can help.
- `100% CPU`: works, just slower. Consider a smaller model.

> Don't worry if the model's own answer is wrong (small models often are on rule details). In the app, the model only rewrites the Sunshine and Little League rules the app looked up, and those rules are always shown underneath.

## 5. Let the app reach Ollama

By default Ollama only accepts requests from pages on your own computer. Allow the app's website:

```powershell
setx OLLAMA_ORIGINS "*"
```

Note: typing `OLLAMA_ORIGINS=*` on its own does not work in PowerShell; use `setx` as above. It should print `SUCCESS: Specified value was saved.`

**Restart Ollama so it picks up the setting** (it only applies to programs started afterwards). Quitting from the tray sometimes leaves it running, so this is the reliable way:

```powershell
Get-Process ollama* | Stop-Process -Force
Start-Process "$env:LOCALAPPDATA\Programs\Ollama\ollama app.exe"
```

Wait about 5 seconds, then check that Ollama now allows the site:

```powershell
curl.exe -s -D - -o NUL -H "Origin: https://seanrugg.github.io" http://127.0.0.1:11434/v1/models
```

The output should include a line starting with `Access-Control-Allow-Origin`. If it doesn't, run `[Environment]::GetEnvironmentVariable("OLLAMA_ORIGINS","User")`; it should print `*`. If it does but the header is still missing, Ollama didn't restart: run the two restart lines again.

## 6. Connect the app (Part A: on this computer)

1. Open the app in **Chrome or Edge**: https://seanrugg.github.io/Sunshine_DiamondAgentIQ/
2. Tap the pill in the header (it says *Offline ⚙*) to open **How should answers work?**
3. Choose **My AI provider**, then **Provider: Ollama on this computer**.
4. **Address:** `http://127.0.0.1:11434/v1` (`http://localhost:11434/v1` also works on most computers).
5. Tap **Load models**, then pick your model in the **Model** box (e.g. `llama3.2:3b`).
6. Tap **Test**. You should see **✓ Connected.**
7. Scroll down and tap **Use my AI provider**. The header pill changes to **My AI**.
8. Ask a question, e.g. with 10U selected: *"My son struck out looking to end the game. How do I help him?"* Under the verdict the card should say **Written by llama3.2:3b via your provider**.

If Chrome asks to let the site **access devices on your local network**, choose **Allow**. If you dismissed it: click the icon at the left end of the address bar → **Site settings** → **Local network access** → **Allow**, then reload.

The first answer can take a few extra seconds while Ollama loads the model; after that it is quick. Ollama unloads the model after about 5 minutes idle, so ask one warm-up question right before a demo.

## 7. Optional: fit more of the model on the GPU

If `ollama ps` shows part of the model on the CPU, these shrink the model's working memory:

```powershell
setx OLLAMA_FLASH_ATTENTION "1"
setx OLLAMA_KV_CACHE_TYPE "q8_0"
```

Restart Ollama (the two lines in step 5), ask a question, and run `ollama ps` again.

---

## Part B: phones on the same Wi-Fi (computer as the league server)

Phones can't reach Ollama from the GitHub Pages site (an `https` page can't call a plain `http` address on another device). Instead, the computer runs the app's own small server, which talks to Ollama on the same machine, and phones open the app from the computer.

1. Install **Node.js 22** from https://nodejs.org (LTS) and get the repo:
   ```powershell
   git clone https://github.com/seanrugg/Sunshine_DiamondAgentIQ
   cd Sunshine_DiamondAgentIQ
   ```
   (No `npm install` needed: the app has no dependencies.)
2. Start the server pointed at Ollama:
   ```powershell
   $env:LLM_BASE_URL="http://127.0.0.1:11434/v1"; $env:LLM_MODEL="llama3.2:3b"; npm start
   ```
   It prints `Sunshine DiamondAgentIQ on http://0.0.0.0:8787 (model: llama3.2:3b ...)`. Leave this window open.
3. Find the computer's address: run `ipconfig` and note the **IPv4 Address** under the Wi-Fi adapter (e.g. `192.168.1.42`).
4. The first time, Windows asks whether Node.js may use the network. Allow it on **Private networks**. (If you missed it: Windows Security → Firewall & network protection → Allow an app through firewall → Node.js → Private.)
5. On a phone on the **same Wi-Fi**, open `http://192.168.1.42:8787` (your address).
6. Tap the header pill → **League server**, leave the address **blank**, tap **Test** (should say *Connected (llama3.2:3b)*), then **Use league server**.

Because this address is plain `http`, phones can't install the app or use it offline from it. Use the GitHub Pages copy for the install and airplane-mode part of a demo. Guest or event Wi-Fi often blocks device-to-device traffic; a phone hotspot from the laptop works when it does.

---

## Troubleshooting

| What you see | What to do |
|---|---|
| **Failed to fetch** or **Couldn't load models: Failed to fetch** | Ollama didn't restart with `OLLAMA_ORIGINS` (step 5, run the restart lines and the `curl.exe` check), or Chrome is blocking local network access (step 6, allow it in Site settings). Also try the address `http://127.0.0.1:11434/v1`. |
| `OLLAMA_ORIGINS=*` "is not recognized" | That's bash syntax. In PowerShell use `setx OLLAMA_ORIGINS "*"`. |
| **The provider said 404** | The model name is wrong or not downloaded. Run `ollama list` and pick a name from it, or tap **Load models**. |
| **AI not available right now (...)** under an answer | The app fell back to the offline answer. The message in parentheses says why; usually Ollama stopped or the model name changed. The offline answer is still correct. |
| Answers are slow | Check `ollama ps`: if mostly CPU, try step 7 or a smaller model (`llama3.2:1b`). Ask a warm-up question first. |
| `ollama` "is not recognized" | Close and reopen PowerShell after installing, so it picks up the new PATH. |
| Phones can't open `http://<ip>:8787` | Same Wi-Fi? Firewall allowed Node.js on Private networks? Is the network marked Private (Settings → Network & internet → Wi-Fi → your network)? Event Wi-Fi may block it; use a hotspot. |

To stop using the local model, open the header pill and choose **Offline**. To stop Ollama completely: `Get-Process ollama* | Stop-Process -Force`.
