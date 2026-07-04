const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const JSZip = require('jszip');

// Polyfill global.Blob and global.FileReader for Node/JSZip compatibility
global.Blob = class Blob {
  constructor(parts) {
    this.buffer = Buffer.concat(parts.map(p => {
      if (typeof p === 'string') return Buffer.from(p);
      if (p instanceof ArrayBuffer) return Buffer.from(p);
      if (p instanceof Uint8Array || Buffer.isBuffer(p)) return p;
      if (p && p.buffer instanceof ArrayBuffer) {
        return Buffer.from(p.buffer, p.byteOffset, p.byteLength);
      }
      return Buffer.from(p);
    }));
  }
  async arrayBuffer() {
    return this.buffer.buffer.slice(
      this.buffer.byteOffset,
      this.buffer.byteOffset + this.buffer.byteLength
    );
  }
};

global.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    const arrayBuffer = blob.buffer.buffer.slice(
      blob.buffer.byteOffset,
      blob.buffer.byteOffset + blob.buffer.byteLength
    );
    setTimeout(() => {
      if (this.onload) {
        this.onload({
          target: { result: arrayBuffer }
        });
      }
    }, 0);
  }
};

// Tool Paths
const JAVA_BIN = '/home/zax4r0/.local/share/flatpak/app/com.google.AndroidStudio/x86_64/stable/29500a3ec68b584dcc76f5d18862624ebbde260ac4f0349305bf1220bbef6c76/files/extra/jbr/bin';
const APKSIGNER = '/home/zax4r0/Android/Sdk/build-tools/37.0.0/apksigner';

// Mods mapping (offset and patch bytes)
// 32-bit patches (file: split_config.armeabi_v7a.apk -> lib/armeabi-v7a/libcocos2dcpp.so)
const patches_32 = {
  ammo: { name: "Unlimited Ammo", offset: 0x00812e38, bytes: [0x1e, 0xff, 0x2f, 0xe1] }, // bx lr
  flight: { name: "Unlimited Flight", offset: 0x007aa654, bytes: [0x01, 0x00, 0xa0, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] }, // mov r0, #1; bx lr
  health: {
    name: "Unlimited Health",
    multi: [
      { offset: 0x007ad9cc, bytes: [0x00, 0x00, 0x00, 0xe3, 0xc8, 0x02, 0x44, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] }, // SoldierLocalController::getHP
      { offset: 0x0079f1b8, bytes: [0x00, 0x00, 0x00, 0xe3, 0xc8, 0x02, 0x44, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] }  // SoldierController::getHP
    ]
  },
  pro: { name: "Pro Pack Unlocked", offset: 0x00878910, bytes: [0x01, 0x00, 0xa0, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] },
  reload: {
    name: "No Reload",
    multi: [
      { offset: 0x008131ec, bytes: [0x00, 0x00, 0xa0, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] }, // getReloadTime -> 0.0f
      { offset: 0x00813290, bytes: [0x00, 0x00, 0xa0, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] }  // isReloading -> false (0)
    ]
  },
  multishot: { name: "Multishot (4x)", offset: 0x00813300, bytes: [0x04, 0x00, 0xa0, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] },
  dual: {
    name: "Dual Wield",
    multi: [
      { offset: 0x008133c0, bytes: [0x01, 0x00, 0xa0, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] },
      { offset: 0x008133f8, bytes: [0x01, 0x00, 0xa0, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] }
    ]
  },
  shop: { name: "Unlock All Items", offset: 0x00513670, bytes: [0x01, 0x00, 0xa0, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] },
  recoil: { name: "No Recoil", offset: 0x0079f504, bytes: [0x1e, 0xff, 0x2f, 0xe1] },
  gravity: { name: "Zero Gravity", offset: 0x0056fb70, bytes: [0x00, 0x00, 0xa0, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] },
  damage: { name: "One-Shot Kill", offset: 0x008130e8, bytes: [0x00, 0x00, 0x00, 0xe3, 0x79, 0x04, 0x44, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] },
  melee: { name: "One-Punch Kill", offset: 0x00813104, bytes: [0x00, 0x00, 0x00, 0xe3, 0x79, 0x04, 0x44, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] },
  range: { name: "Infinite Range", offset: 0x00813138, bytes: [0x00, 0x0c, 0x03, 0xe3, 0x1c, 0x06, 0x44, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] },
  speed: { name: "Super Bullet Speed", offset: 0x0081338c, bytes: [0x00, 0x0c, 0x03, 0xe3, 0x1c, 0x06, 0x44, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] },
  respawn: { name: "Instant Respawn", offset: 0x00883b78, bytes: [0x00, 0x00, 0xa0, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] },
  rapid: { name: "Rapid Fire (No Delay)", offset: 0x0081331c, bytes: [0x00, 0x00, 0xa0, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] },
  laser: { name: "Laser Sight (All Weapons)", offset: 0x0081d720, bytes: [0x01, 0x00, 0xa0, 0xe3, 0x1e, 0xff, 0x2f, 0xe1] }
};

// 64-bit patches (file: split_config.arm64_v8a.apk -> lib/arm64-v8a/libcocos2dcpp.so)
const patches_64 = {
  ammo: { name: "Unlimited Ammo", offset: 0x009482e0, bytes: [0xc0, 0x03, 0x5f, 0xd6] }, // ret
  flight: { name: "Unlimited Flight", offset: 0x008ec7b8, bytes: [0x20, 0x00, 0x80, 0x52, 0xc0, 0x03, 0x5f, 0xd6] }, // mov w0, #1; ret
  health: {
    name: "Unlimited Health",
    multi: [
      { offset: 0x008ef1e4, bytes: [0x80, 0x0c, 0x80, 0x52, 0x00, 0x00, 0x22, 0x1e, 0xc0, 0x03, 0x5f, 0xd6] }, // SoldierLocalController::getHP
      { offset: 0x008e2b14, bytes: [0x80, 0x0c, 0x80, 0x52, 0x00, 0x00, 0x22, 0x1e, 0xc0, 0x03, 0x5f, 0xd6] }  // SoldierController::getHP
    ]
  },
  pro: { name: "Pro Pack Unlocked", offset: 0x009a8f08, bytes: [0x20, 0x00, 0x80, 0x52, 0xc0, 0x03, 0x5f, 0xd6] },
  reload: {
    name: "No Reload",
    multi: [
      { offset: 0x00948664, bytes: [0xe0, 0x03, 0x27, 0x1e, 0xc0, 0x03, 0x5f, 0xd6] }, // getReloadTime -> 0.0f
      { offset: 0x009486f8, bytes: [0x00, 0x00, 0x80, 0x52, 0xc0, 0x03, 0x5f, 0xd6] }  // isReloading -> false
    ]
  },
  multishot: { name: "Multishot (4x)", offset: 0x00948770, bytes: [0x80, 0x00, 0x80, 0x52, 0xc0, 0x03, 0x5f, 0xd6] },
  dual: {
    name: "Dual Wield",
    multi: [
      { offset: 0x00948818, bytes: [0x20, 0x00, 0x80, 0x52, 0xc0, 0x03, 0x5f, 0xd6] },
      { offset: 0x00948858, bytes: [0x20, 0x00, 0x80, 0x52, 0xc0, 0x03, 0x5f, 0xd6] }
    ]
  },
  shop: { name: "Unlock All Items", offset: 0x00686c0c, bytes: [0x20, 0x00, 0x80, 0x52, 0xc0, 0x03, 0x5f, 0xd6] },
  recoil: { name: "No Recoil", offset: 0x008e2e98, bytes: [0xc0, 0x03, 0x5f, 0xd6] },
  gravity: { name: "Zero Gravity", offset: 0x006dbb94, bytes: [0xe0, 0x03, 0x27, 0x1e, 0xc0, 0x03, 0x5f, 0xd6] },
  damage: { name: "One-Shot Kill", offset: 0x00948584, bytes: [0xe0, 0x7c, 0x80, 0x52, 0x00, 0x00, 0x22, 0x1e, 0xc0, 0x03, 0x5f, 0xd6] },
  melee: { name: "One-Punch Kill", offset: 0x0094859c, bytes: [0xe0, 0x7c, 0x80, 0x52, 0x00, 0x00, 0x22, 0x1e, 0xc0, 0x03, 0x5f, 0xd6] },
  range: { name: "Infinite Range", offset: 0x009485cc, bytes: [0xe0, 0xe1, 0x84, 0x52, 0x00, 0x00, 0x22, 0x1e, 0xc0, 0x03, 0x5f, 0xd6] },
  speed: { name: "Super Bullet Speed", offset: 0x009487f0, bytes: [0xe0, 0xe1, 0x84, 0x52, 0x00, 0x00, 0x22, 0x1e, 0xc0, 0x03, 0x5f, 0xd6] },
  respawn: { name: "Instant Respawn", offset: 0x009b38e8, bytes: [0x00, 0x00, 0x80, 0x52, 0xc0, 0x03, 0x5f, 0xd6] },
  rapid: { name: "Rapid Fire (No Delay)", offset: 0x00948788, bytes: [0xe0, 0x03, 0x27, 0x1e, 0xc0, 0x03, 0x5f, 0xd6] },
  laser: { name: "Laser Sight (All Weapons)", offset: 0x00952140, bytes: [0x20, 0x00, 0x80, 0x52, 0xc0, 0x03, 0x5f, 0xd6] }
};

async function patchSoBuffer(soData, patchesToApply, patchesMap) {
  for (const modId of patchesToApply) {
    const patchConfig = patchesMap[modId];
    if (!patchConfig) continue;

    console.log(`  Applying mod: ${patchConfig.name}...`);
    if (patchConfig.multi) {
      for (const p of patchConfig.multi) {
        const patchBuffer = Buffer.from(p.bytes);
        soData.write(patchBuffer.toString('binary'), p.offset, patchBuffer.length, 'binary');
      }
    } else {
      const patchBuffer = Buffer.from(patchConfig.bytes);
      soData.write(patchBuffer.toString('binary'), patchConfig.offset, patchBuffer.length, 'binary');
    }
  }
}

async function run(args) {
  const apkmFile = args.apkm;
  const outputApks = args.output;
  const workDir = args.workdir;
  const selectedMods = args.mods.split(',').filter(Boolean);
  const shouldInstall = args.install === 'true';

  console.log(`Working Directory: ${workDir}`);
  console.log(`Selected Mods: ${selectedMods.join(', ')}`);

  if (fs.existsSync(workDir)) {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  fs.mkdirSync(workDir);

  const targetApks = [
    'base.apk',
    'split_config.armeabi_v7a.apk',
    'split_config.arm64_v8a.apk',
    'split_config.en.apk',
    'split_config.xxhdpi.apk',
    'split_config.xxxhdpi.apk'
  ];

  console.log('1. Extracting APK files from APKM...');
  const apkmData = fs.readFileSync(apkmFile);
  const apkmZip = await JSZip.loadAsync(apkmData);
  for (const filename of targetApks) {
    const fileData = await apkmZip.file(filename).async('nodebuffer');
    fs.writeFileSync(path.join(workDir, filename), fileData);
  }

  // 2. Patch 32-bit APK if selected
  console.log('2. Patching 32-bit library (libcocos2dcpp.so)...');
  const arm32ApkPath = path.join(workDir, 'split_config.armeabi_v7a.apk');
  const arm32Zip = await JSZip.loadAsync(fs.readFileSync(arm32ApkPath));
  const soPath32 = 'lib/armeabi-v7a/libcocos2dcpp.so';
  const soData32 = await arm32Zip.file(soPath32).async('nodebuffer');
  await patchSoBuffer(soData32, selectedMods, patches_32);
  arm32Zip.file(soPath32, soData32);
  fs.writeFileSync(arm32ApkPath, await arm32Zip.generateAsync({ type: 'nodebuffer' }));

  // 3. Patch 64-bit APK if selected
  console.log('3. Patching 64-bit library (libcocos2dcpp.so)...');
  const arm64ApkPath = path.join(workDir, 'split_config.arm64_v8a.apk');
  const arm64Zip = await JSZip.loadAsync(fs.readFileSync(arm64ApkPath));
  const soPath64 = 'lib/arm64-v8a/libcocos2dcpp.so';
  const soData64 = await arm64Zip.file(soPath64).async('nodebuffer');
  await patchSoBuffer(soData64, selectedMods, patches_64);
  arm64Zip.file(soPath64, soData64);
  fs.writeFileSync(arm64ApkPath, await arm64Zip.generateAsync({ type: 'nodebuffer' }));

  console.log('4. Repackaging and Aligning target APKs (using 16KB page alignment)...');
  for (const filename of targetApks) {
    const apkPath = path.join(workDir, filename);
    const zip = await JSZip.loadAsync(fs.readFileSync(apkPath));
    const outputZip = new JSZip();

    for (const [filePath, fileObj] of Object.entries(zip.files)) {
      if (fileObj.dir) continue;
      if (filePath.startsWith('META-INF/')) continue; // Remove old signatures

      const fileData = await fileObj.async('nodebuffer');
      let method = 'DEFLATE';
      if (fileObj._data && fileObj._data.compression && fileObj._data.compression.magic === '\x00\x00') {
        method = 'STORE';
      }
      if (filePath.endsWith('.so')) {
        method = 'STORE'; // Native libraries MUST be uncompressed
      }

      if (method === 'STORE') {
        outputZip.file(filePath, fileData, { compression: 'STORE' });
      } else {
        outputZip.file(filePath, fileData, { compression: 'DEFLATE', compressionOptions: { level: 5 } });
      }
    }

    const { Zip } = require('@chromeos/android-package-signer/dist/lib/Zip');
    const customZip = new Zip(outputZip);
    const postAlignBase64 = await customZip.exportZipAsBase64();
    fs.writeFileSync(apkPath, Buffer.from(postAlignBase64, 'base64'));
  }

  console.log('5. Generating keystore and signing APKs...');
  const keystorePath = path.join(workDir, 'temp.keystore');
  const keytoolCmd = `"${path.join(JAVA_BIN, 'keytool')}" -genkeypair -v -keystore "${keystorePath}" -alias modkey -keyalg RSA -keysize 2048 -validity 10000 -storepass password -keypass password -dname "CN=Mini Militia Mod, O=Modding Co, C=US"`;
  execSync(keytoolCmd, { stdio: 'ignore' });

  const env = { ...process.env, PATH: `${JAVA_BIN}:${process.env.PATH}` };
  for (const filename of targetApks) {
    const apkPath = path.join(workDir, filename);
    const apksignerCmd = `"${APKSIGNER}" sign --ks "${keystorePath}" --ks-pass pass:password --key-pass pass:password "${apkPath}"`;
    execSync(apksignerCmd, { env, stdio: 'ignore' });
  }
  console.log('  APKs signed successfully (v2/v3 scheme).');

  console.log(`6. Bundling signed splits into final APKS archive...`);
  const outputZip = new JSZip();
  for (const filename of targetApks) {
    const apkData = fs.readFileSync(path.join(workDir, filename));
    outputZip.file(filename, apkData);
  }
  const apksBuffer = await outputZip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(outputApks, apksBuffer);
  console.log(`  Saved APKS bundle to: ${outputApks}`);

  if (shouldInstall) {
    console.log('7. Installing APKs on phone via ADB...');
    const adbCmd = `adb install-multiple -r ${targetApks.map(f => `"${path.join(workDir, f)}"`).join(' ')}`;
    try {
      const output = execSync(adbCmd, { encoding: 'utf8' });
      console.log('ADB Output:\n', output);
      console.log('🎉 Modded Mini Militia installed successfully on your phone!');
    } catch (error) {
      console.error('Error during ADB installation:', error.message);
      if (error.stdout) console.log('stdout:', error.stdout);
      if (error.stderr) console.log('stderr:', error.stderr);
      throw error;
    }
  }

  console.log('8. Cleaning up...');
  fs.rmSync(workDir, { recursive: true, force: true });
}

// Parse Command Line Arguments
const args = {};
process.argv.slice(2).forEach(arg => {
  const [key, value] = arg.split('=');
  if (key && value) {
    args[key.replace('--', '')] = value;
  }
});

run(args).catch(err => {
  console.error('Helper execution failed:', err);
  process.exit(1);
});
