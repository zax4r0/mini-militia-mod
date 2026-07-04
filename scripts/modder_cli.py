#!/usr/bin/env python3
import os
import sys
import subprocess
import argparse

# Path config
SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
REPO_DIR = os.path.dirname(SCRIPT_DIR)
PACK_HELPER_JS = os.path.join(SCRIPT_DIR, "pack_helper.js")

# List of available mods
MODS = {
    "ammo": "Unlimited Ammo (disable ammo & grenade subtraction)",
    "flight": "Unlimited Jetpack Flight / Power",
    "health": "Unlimited Health (God Mode - 100% HP)",
    "pro": "Pro Pack Unlocked",
    "reload": "No Reload time for all weapons",
    "multishot": "Shoot 4 bullets at once (multishot)",
    "dual": "Dual-Wield any heavy/primary weapon",
    "shop": "Unlock all shop items"
}

def print_banner():
    print("=" * 60)
    print("      💣 MINI MILITIA CLASSIC INTERACTIVE MODDER 💣      ")
    print("=" * 60)

def show_menu(selected):
    print("\nSelect the mods you want to apply to the build:")
    for key, name in MODS.items():
        status = "[X]" if key in selected else "[ ]"
        print(f"  {status} {key:<12} - {name}")
    print("\nCommands:")
    print("  Type a mod ID (e.g. 'ammo') to toggle it.")
    print("  Type 'all' to select all mods.")
    print("  Type 'clear' to deselect all mods.")
    print("  Type 'done' or press Enter to compile and build.")
    print("  Type 'exit' to quit.")

def main():
    parser = argparse.ArgumentParser(description="Mini Militia Modder CLI")
    parser.add_argument("--apkm", default="/home/zax4r0/Templates/com.appsomniacs.mmc_0.14.4-88_2arch_7dpi_30lang_9e191f730dbf21afbef2b87a6fae5279_apkmirror.com.apkm", help="Path to original APKM file")
    parser.add_argument("--output", default="/home/zax4r0/Templates/mini-militia-modded.apks", help="Output path for the compiled APKS file")
    parser.add_argument("--workdir", default="/home/zax4r0/Templates/mod_workspace", help="Temporary workspace path")
    parser.add_argument("--install", choices=["true", "false"], default="true", help="Install to device via ADB immediately after building")
    args = parser.parse_args()

    if not os.path.exists(args.apkm):
        print(f"Error: Original APKM file not found at {args.apkm}")
        sys.exit(1)

    print_banner()

    selected_mods = set()
    while True:
        show_menu(selected_mods)
        choice = input("\nChoose an option: ").strip().lower()

        if choice == "exit":
            print("Exiting...")
            sys.exit(0)
        elif choice in ["done", ""]:
            if not selected_mods:
                print("No mods selected. Please select at least one mod.")
                continue
            break
        elif choice == "all":
            selected_mods = set(MODS.keys())
        elif choice == "clear":
            selected_mods.clear()
        elif choice in MODS:
            if choice in selected_mods:
                selected_mods.remove(choice)
            else:
                selected_mods.add(choice)
        else:
            print("Invalid option, try again.")

    mods_str = ",".join(selected_mods)
    print("\n" + "=" * 60)
    print(f"Building modded APK with: {', '.join(selected_mods)}")
    print("=" * 60 + "\n")

    # Run Node helper process
    cmd = [
        "node",
        PACK_HELPER_JS,
        f"--apkm={args.apkm}",
        f"--output={args.output}",
        f"--workdir={args.workdir}",
        f"--mods={mods_str}",
        f"--install={args.install}"
    ]

    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError:
        print("\n❌ Compilation failed. Check the error trace above.")
        sys.exit(1)

if __name__ == "__main__":
    main()
