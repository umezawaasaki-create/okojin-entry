/**
 * 大高人 入会申請フォーム → 既存の名簿スプレッドシートへの自動追記スクリプト
 *
 * 対象スプレッドシート:
 *   https://docs.google.com/spreadsheets/d/1NWLLHauvqE2zRVh31BYsORY48JoqqaTD/edit?gid=2013538450
 *
 * 列構成（既存の名簿シートに合わせています）:
 *   A:No  B:役割  C:大高人チャット  D:大高人通信  E:名前  F:ふりがな  G:卒業年
 *   H:仕事の内容  I:現職  J:これまでの経歴  K:大学  L:高校時代の主な活動  M:大学進路を決めた経緯  N:メールアドレス
 *
 * 「役割」「大高人チャット」「大高人通信」は手動管理の列のため、自動入力はせず空欄のまま追記します。
 * 「No」は既存データの最大値+1を自動採番します（3桁ゼロ埋め）。
 *
 * 【セットアップ手順】
 * すでに動作確認済みのApps Scriptプロジェクトがあれば、そのプロジェクトのコードを
 * このファイルの内容にまるごと置き換えて保存し、「デプロイ」→「デプロイを管理」→
 * 既存デプロイの編集（鉛筆アイコン）→ バージョン「新バージョン」を選んで「デプロイ」すれば、
 * ウェブアプリのURLは変えずにこの新しい書き込み先に切り替わります。
 * （index.html 側のGAS_URLは変更不要です）
 *
 * このスクリプトは openById() で対象スプレッドシートを直接指定しているため、
 * どのGoogleアカウントでスクリプトを実行していても、そのアカウントが対象スプレッドシートに
 * 編集権限を持ってさえいれば書き込めます（このスクリプト自体が対象シートに紐づいている必要はありません）。
 */

const SPREADSHEET_ID = '1NWLLHauvqE2zRVh31BYsORY48JoqqaTD';
const SHEET_GID = 2013538450; // 名簿タブのgid

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getTargetSheet_();
    const nextNo = getNextNo_(sheet);

    sheet.appendRow([
      nextNo,                   // A No
      '',                       // B 役割（手動）
      '',                       // C 大高人チャット（手動）
      '',                       // D 大高人通信（手動）
      data.name || '',          // E 名前
      data.furigana || '',      // F ふりがな
      data.graduYear || '',     // G 卒業年
      data.job || '',           // H 仕事の内容
      data.currentJob || '',    // I 現職
      data.career || '',        // J これまでの経歴
      data.university || '',    // K 大学
      data.clubActivity || '',  // L 高校時代の主な活動
      data.univReason || '',    // M 大学進路を決めた経緯
      data.email || '',         // N メールアドレス
    ]);

    notifyAdmin_(data, nextNo);

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success', no: nextNo }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function getTargetSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheets().find(s => s.getSheetId() === SHEET_GID);
  if (!sheet) {
    throw new Error('対象シート（gid=' + SHEET_GID + ')が見つかりません。SHEET_GIDの値を確認してください。');
  }
  return sheet;
}

/**
 * 既存の「No」列（A列）の最大値+1を、3桁ゼロ埋め文字列（例: "160"）で返す。
 * データが無い場合は "001" から開始する。
 */
function getNextNo_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return '001';

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  let max = 0;
  values.forEach(v => {
    const n = parseInt(v, 10);
    if (!isNaN(n) && n > max) max = n;
  });

  const next = max + 1;
  return ('000' + next).slice(-3);
}

/**
 * 新規申請があったことを幹事にメール通知する。
 * 件名は既存の運用形式「【大高人】新規入会申請 No.xxx 〇〇 さん」に合わせている。
 * 通知が不要であれば doPost 内の notifyAdmin_(data, nextNo); の行を削除してよい。
 */
const ADMIN_EMAIL = 'okojin.unei@gmail.com';

function notifyAdmin_(data, no) {
  if (!ADMIN_EMAIL) return;

  const surname = (data.name || '').split(/[\s　]+/)[0] || data.name || '';

  MailApp.sendEmail({
    to: ADMIN_EMAIL,
    subject: `【大高人】新規入会申請 No.${no} ${surname} さん`,
    body:
      `新しい入会申請が届きました。\n\n` +
      `No：${no}\n` +
      `名前：${data.name || ''}\n` +
      `ふりがな：${data.furigana || ''}\n` +
      `卒業年：${data.graduYear || ''}\n` +
      `メールアドレス：${data.email || ''}\n` +
      `現職：${data.currentJob || ''}\n\n` +
      `詳細は名簿スプレッドシートをご確認ください。\n` +
      `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit?gid=${SHEET_GID}`,
  });
}
