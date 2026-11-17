// Fails when the Play compile set can still download game files or open the downloaded copy.
// Sideload sources (android/src BuildFlags + GameUpdateBridge) are the opposite: they must keep that path.
// A Play classes/dex/aab output is scanned when it is already on disk. This script does not build or sign.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BANNED = [
  'files.json',
  'getFilesDir(), "ota"',
  'otaRoot',
  'DropHavoc.apk',
  'application/vnd.android.package-archive',
  'MANAGE_UNKNOWN_APP_SOURCES',
];

function walkJava(dir, skipNames, out) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walkJava(p, skipNames, out);
    else if (name.endsWith('.java') && !skipNames.has(name)) out.push(p);
  }
}

export function playJavaSources(root = ROOT) {
  const files = [];
  walkJava(path.join(root, 'android/src'), new Set(['UpdateProvider.java', 'BuildFlags.java', 'GameUpdateBridge.java', 'ApkInstaller.java']), files);
  files.push(path.join(root, 'android/play/BuildFlags.java'));
  files.push(path.join(root, 'android/play/GameUpdateBridge.java'));
  files.push(path.join(root, 'android/play/ApkInstaller.java'));
  return files;
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function bannedIn(text) {
  return BANNED.filter((s) => text.includes(s));
}

export function playRemoteUpdateProblems(root = ROOT) {
  const problems = [];
  const playFlags = read(root, 'android/play/BuildFlags.java');
  const sideFlags = read(root, 'android/src/com/scitedragames/drophavoc/BuildFlags.java');
  const playBridge = read(root, 'android/play/GameUpdateBridge.java');
  const sideBridge = read(root, 'android/src/com/scitedragames/drophavoc/GameUpdateBridge.java');
  const playApk = read(root, 'android/play/ApkInstaller.java');
  const sideApk = read(root, 'android/src/com/scitedragames/drophavoc/ApkInstaller.java');
  const main = read(root, 'android/src/com/scitedragames/drophavoc/MainActivity.java');
  const aab = read(root, 'android/build-aab.sh');
  const updateJs = read(root, 'public/update-check.js');

  if (!/REMOTE_GAME_UPDATES\s*=\s*false/.test(playFlags)) problems.push('Play BuildFlags must set REMOTE_GAME_UPDATES = false');
  if (!/REMOTE_GAME_UPDATES\s*=\s*true/.test(sideFlags)) problems.push('Sideload BuildFlags must keep REMOTE_GAME_UPDATES = true');
  if (!sideBridge.includes('files.json')) problems.push('Sideload GameUpdateBridge must still download files.json');
  if (!sideApk.includes('DropHavoc.apk')) problems.push('Sideload ApkInstaller must still download the APK');
  const playBridgeBanned = bannedIn(playBridge);
  if (playBridgeBanned.length) problems.push('Play GameUpdateBridge still contains: ' + playBridgeBanned.join(', '));
  const playApkBanned = bannedIn(playApk);
  if (playApkBanned.length) problems.push('Play ApkInstaller still contains: ' + playApkBanned.join(', '));
  if (/void download\(/.test(main) || /void install\(/.test(main)) {
    problems.push('MainActivity must not declare download or install; those stay in ApkInstaller');
  }
  if (/if\s*\(\s*isPlay\(\)\s*\)/.test(main)) {
    problems.push('MainActivity must block updates with BuildFlags.REMOTE_GAME_UPDATES, not isPlay()');
  }
  if (!/store\(\)\s*\{\s*return BuildFlags\.REMOTE_GAME_UPDATES \? "apk" : "play"/.test(main)) {
    problems.push('store() must follow the compile flag so the JS layer and the native block agree');
  }

  if (!/if\s*\(\s*!\s*BuildFlags\.REMOTE_GAME_UPDATES\s*\)\s*return;/.test(main)) {
    problems.push('MainActivity.updateGame must return immediately when REMOTE_GAME_UPDATES is false');
  }
  if (!/if\s*\(\s*BuildFlags\.REMOTE_GAME_UPDATES\s*\)/.test(main)) {
    problems.push('MainActivity.startPage must skip the downloaded copy unless REMOTE_GAME_UPDATES is true');
  }
  const mainBanned = bannedIn(main);
  if (mainBanned.length) problems.push('MainActivity (in both builds) still contains: ' + mainBanned.join(', '));

  if (!aab.includes('! -name BuildFlags.java') || !aab.includes('! -name GameUpdateBridge.java') || !aab.includes('! -name ApkInstaller.java')) {
    problems.push('build-aab.sh must exclude the sideload BuildFlags, GameUpdateBridge and ApkInstaller');
  }
  if (!aab.includes('play/BuildFlags.java') || !aab.includes('play/GameUpdateBridge.java') || !aab.includes('play/ApkInstaller.java')) {
    problems.push('build-aab.sh must compile the Play BuildFlags, GameUpdateBridge and ApkInstaller');
  }

  for (const file of playJavaSources(root)) {
    const rel = path.relative(root, file);
    if (!fs.existsSync(file)) { problems.push('Missing Play source: ' + rel); continue; }
    const hit = bannedIn(fs.readFileSync(file, 'utf8'));
    if (hit.length) problems.push('Play compile set ' + rel + ' still contains: ' + hit.join(', '));
  }

  const playUpdate = read(root, 'shared/play-update.js');
  if (!playUpdate.includes('export function isPlayStore') || !playUpdate.includes('export function shouldDownloadGameFiles')) {
    problems.push('shared/play-update.js must keep isPlayStore() as the second layer');
  }
  if (!updateJs.includes("from './shared/play-update.js'") && !updateJs.includes('from "./shared/play-update.js"')) {
    problems.push('update-check.js must use shared/play-update.js as the second layer');
  }
  const playJs = updateJs.indexOf('isPlayStore(app)');
  const gameJs = updateJs.indexOf('app.updateGame');
  if (playJs < 0 || gameJs < 0 || playJs > gameJs) {
    problems.push('update-check.js must check isPlayStore before updateGame');
  }
  if (!/if\s*\(\s*shouldDownloadGameFiles\(/.test(updateJs)) {
    problems.push('update-check.js must gate the sideload game-file download on shouldDownloadGameFiles');
  }
  if (/if\s*\(\s*channel\s*===\s*'android'\s*&&\s*app\?\.updateGame/.test(updateJs)) {
    problems.push('update-check.js still calls updateGame from the old unguarded condition');
  }

  const outputs = [
    'android/build/aab/classes',
    'android/build/aab/module/dex',
    'android/build/DropHavoc.aab',
  ];
  for (const rel of outputs) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    const blob = readBinary(abs);
    if (blob.includes(Buffer.from('files.json'))) problems.push('Play build output still contains files.json: ' + rel);
    if (blob.includes(Buffer.from('getFilesDir(), "ota"'))) problems.push('Play build output still contains the ota folder loader: ' + rel);
    if (blob.includes(Buffer.from('DropHavoc.apk'))) problems.push('Play build output still contains the APK download: ' + rel);
    if (blob.includes(Buffer.from('application/vnd.android.package-archive'))) problems.push('Play build output still contains the APK installer: ' + rel);
  }
  return problems;
}

function readBinary(abs) {
  const st = fs.statSync(abs);
  if (st.isFile()) return fs.readFileSync(abs);
  const chunks = [];
  const stack = [abs];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const s = fs.statSync(p);
      if (s.isDirectory()) stack.push(p);
      else if (s.isFile() && s.size < 80_000_000) chunks.push(fs.readFileSync(p));
    }
  }
  return Buffer.concat(chunks);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const problems = playRemoteUpdateProblems();
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log('Play build blocks remote game updates');
}
