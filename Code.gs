/**
 * 大高人 入会申請フォーム → Google スプレッドシート 書き込み用スクリプト
 *
 * 【セットアップ手順】
 * 1. Google スプレッドシートを新規作成する（または申請管理用に使う既存のシートを開く）
 * 2. メニュー「拡張機能」→「Apps Script」を開く
 * 3. デフォルトで入っているコードを全て削除し、このファイルの内容を貼り付けて保存
 * 4. 右上「デプロイ」→「新しいデプロイ」
 *      種類の選択：ウェブアプリ
 *      実行するユーザー：自分
 *      アクセスできるユーザー：全員
 * 5. 「デプロイ」をクリック → 初回は権限承認の画面が出るので許可する
 * 6. 発行された「ウェブアプリのURL」をコピーし、index.html 内の
 *    const GAS_URL = "..."; を新しいURLに書き換える
 *
 * ※ 既存の GAS_URL（AKfycbzIQpnD83VoWbJP9s2MtPeFdytBVSRxRbdgLOttqEHhM1gcmUFP3WVbFu1nHwEheZwgxg）に
 *    紐づく既存プロジェクトが心当たりにある場合は、そのプロジェクトのコードをこの内容に置き換えて
 *    「デプロイ」→「デプロイを管理」→ 既存デプロイの編集で新バージョンとして再デプロイすれば
 *    URLはそのままで動くようになる。
 */

const SHEET_NAME = '入会申請一覧';

const HEADERS = [
  '受付日時',
  '名前',
  'ふりがな',
  '卒業年',
  'メールアドレス',
  '現職',
  '仕事の内容',
  'これまでの経歴',
  '大学',
  '高校時代の主な活動',
  '大学進路を決めた経緯',
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getOrCreateSheet_();

    sheet.appendRow([
      new Date(),
      data.name || '',
      data.furigana || '',
      data.graduYear || '',
      data.email || '',
      data.currentJob || '',
      data.job || '',
      data.career || '',
      data.university || '',
      data.clubActivity || '',
      data.univReason || '',
    ]);

    // 幹事への通知メール（任意。不要な場合はこの行をコメントアウト）
    notifyAdmin_(data);

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

/**
 * 新規申請があったことを幹事にメール通知する。
 * 通知先メールアドレスは下の ADMIN_EMAIL を書き換えて使用する。
 * 通知が不要であれば doPost 内の notifyAdmin_(data); の行を削除してよい。
 */
const ADMIN_EMAIL = 'okojin.unei@gmail.com';

function notifyAdmin_(data) {
  if (!ADMIN_EMAIL) return;
  MailApp.sendEmail({
    to: ADMIN_EMAIL,
    subject: '【大高人】新しい入会申請が届きました',
    body:
      `新しい入会申請が届きました。\n\n` +
      `名前：${data.name || ''}\n` +
      `ふりがな：${data.furigana || ''}\n` +
      `卒業年：${data.graduYear || ''}\n` +
      `メールアドレス：${data.email || ''}\n` +
      `現職：${data.currentJob || ''}\n\n` +
      `詳細はスプレッドシート「${SHEET_NAME}」シートをご確認ください。`,
  });
}
