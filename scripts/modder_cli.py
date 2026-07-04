#!/usr/bin/env python3
import os
import sys
import tty
import termios
import subprocess
import argparse

# Path config
SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
PACK_HELPER_JS = os.path.join(SCRIPT_DIR, "pack_helper.js")

# List of available mods (ordered list for indexing)
MODS = [
    ("ammo", "Unlimited Ammo (disable ammo & grenade subtraction)"),
    ("flight", "Unlimited Jetpack Flight / Power"),
    ("health", "Unlimited Health (God Mode - 100% HP)"),
    ("pro", "Pro Pack Unlocked"),
    ("reload", "No Reload time for all weapons"),
    ("multishot", "Shoot 4 bullets at once (multishot)"),
    ("dual", "Dual-Wield any heavy/primary weapon"),
    ("shop", "Unlock all shop items"),
    ("recoil", "No Recoil (disable gun kickback)"),
    ("gravity", "Zero Gravity (float around the map)"),
    ("damage", "One-Shot Kill (massive weapon damage)"),
    ("melee", "One-Punch Kill (massive punch/saw damage)"),
    ("range", "Infinite Range (bullets travel infinitely)"),
    ("speed", "Super Bullet Speed (instant bullet hit)"),
    ("respawn", "Instant Respawn (no respawn delay after death)"),
    ("rapid", "Rapid Fire (maximum fire rate for all guns)"),
    ("laser", "Laser Sight (force laser guides on all weapons)"),
    ("zoom", "Max Zoom (unlock max zoom for all weapons)"),
    ("accuracy", "Perfect Accuracy (zero bullet spread for all weapons)")
]

def get_key():
    """Reads a single keypress, handles escape sequences for arrow keys."""
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    try:
        tty.setraw(sys.stdin.fileno())
        ch = sys.stdin.read(1)
        if ch == '\x1b':
            ch2 = sys.stdin.read(1)
            if ch2 == '[':
                ch3 = sys.stdin.read(1)
                if ch3 == 'A': return 'up'
                if ch3 == 'B': return 'down'
                if ch3 == 'C': return 'right'
                if ch3 == 'D': return 'left'
        elif ch in ['\r', '\n']:
            return 'enter'
        elif ch == ' ':
            return 'space'
        elif ch in ['q', 'Q', '\x03']: # q, Q or Ctrl+C
            return 'quit'
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
    return ch

def render(selected_idx, active_mods):
    """Renders the interactive menu using ANSI escape sequences."""
    # Move cursor to top home position and clear screen
    sys.stdout.write("\033[H\033[J")
    
    print("\033[1;35m" + "=" * 65 + "\033[0m")
    print("\033[1;32m      💣  MINI MILITIA CLASSIC INTERACTIVE TUI MODDER  💣      \033[0m")
    print("\033[1;35m" + "=" * 65 + "\033[0m")
    print("\n \033[1;33mControls:\033[0m Use \033[1;36mUP/DOWN\033[0m arrows, press \033[1;36mSPACE\033[0m to toggle, \033[1;36mENTER\033[0m to build, \033[1;36mQ\033[0m to exit.")
    print("-" * 65 + "\n")
    
    for i, (key, desc) in enumerate(MODS):
        is_hover = (i == selected_idx)
        is_active = (key in active_mods)
        
        marker = "\033[1;36m▶\033[0m " if is_hover else "  "
        checkbox = "\033[1;32m[X]\033[0m" if is_active else "[ ]"
        
        if is_hover:
            # Highlight hovered item with cyan background/text
            print(f"{marker}{checkbox} \033[1;36;40m{key:<12} - {desc}\033[0m")
        else:
            print(f"{marker}{checkbox} {key:<12} - {desc}")
            
    print("\n\033[1;35m" + "=" * 65 + "\033[0m")

def main():
    parser = argparse.ArgumentParser(description="Mini Militia Modder TUI")
    parser.add_argument("--apkm", default="/home/zax4r0/Templates/com.appsomniacs.mmc_0.14.4-88_2arch_7dpi_30lang_9e191f730dbf21afbef2b87a6fae5279_apkmirror.com.apkm", help="Path to original APKM file")
    parser.add_argument("--output", default="/home/zax4r0/Templates/mini-militia-modded.apks", help="Output path for the compiled APKS file")
    parser.add_argument("--workdir", default="/home/zax4r0/Templates/mod_workspace", help="Temporary workspace path")
    parser.add_argument("--install", choices=["true", "false"], default="true", help="Install to device via ADB immediately after building")
    args = parser.parse_args()

    if not os.path.exists(args.apkm):
        print(f"Error: Original APKM file not found at {args.apkm}")
        sys.exit(1)

    selected_idx = 0
    active_mods = set()

    # Enter interactive TUI loop
    try:
        # Hide cursor
        sys.stdout.write("\033[?25l")
        sys.stdout.flush()

        while True:
            render(selected_idx, active_mods)
            key = get_key()

            if key == 'up':
                selected_idx = (selected_idx - 1) % len(MODS)
            elif key == 'down':
                selected_idx = (selected_idx + 1) % len(MODS)
            elif key == 'space':
                mod_key = MODS[selected_idx][0]
                if mod_key in active_mods:
                    active_mods.remove(mod_key)
                else:
                    active_mods.add(mod_key)
            elif key == 'enter':
                if not active_mods:
                    # Temporary cursor show to print error
                    sys.stdout.write("\033[?25h\n\033[1;31mError: Please select at least one mod before compiling.\033[0m\n")
                    sys.stdout.flush()
                    input("Press Enter to continue...")
                    sys.stdout.write("\033[?25l")
                    sys.stdout.flush()
                    continue
                break
            elif key == 'quit':
                # Restore cursor and exit
                sys.stdout.write("\033[?25h\n")
                sys.stdout.flush()
                print("Exiting...")
                sys.exit(0)
    finally:
        # Ensure cursor is always restored
        sys.stdout.write("\033[?25h")
        sys.stdout.flush()

    # Move cursor down to prevent overwriting TUI
    print("\n" + "=" * 65)
    print(f"  Building modded APK with: {', '.join(active_mods)}")
    print("=" * 65 + "\n")

    mods_str = ",".join(active_mods)
    
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
