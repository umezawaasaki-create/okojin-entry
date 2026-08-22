/**
 * 大高人 入会申請フォーム → 既存の名簿スプレッドシートへの自動追記スクリプト
 *
 * 対象スプレッドシート:
 *   https://docs.google.com/spreadsheets/d/1NWLLHauvqE2zRVh31BYsORY48JoqqaTD/edit?gid=2013538450
 *
 * 列構成（既存の名簿シートに合わせています。O・Pは今回追加した列）:
 *   A:No  B:役割  C:大高人チャット  D:大高人通信  E:名前  F:ふりがな  G:卒業年
 *   H:仕事の内容  I:現職  J:これまでの経歴  K:大学  L:高校時代の主な活動  M:大学進路を決めた経緯  N:メールアドレス
 *   O:LINE案内（チェックボックス）  P:LINE案内送信日時
 *
 * 「役割」「大高人チャット」「大高人通信」は手動管理の列のため、自動入力はせず空欄のまま追記します。
 * 「No」は既存データの最大値+1を自動採番します（3桁ゼロ埋め）。
 *
 * 【セットアップ手順】
 * すでに動作確認済みのApps Scriptプロジェクトがあれば、そのプロジェクトのコードを
 * このファイルの内容にまるごと置き換えて保存し、「デプロイ」→「デプロイを管理」→
 * 既存デプロイの編集（鉛筆アイコン）→ バージョン「新バージョン」を選んで「デプロイ」すれば、
 * ウェブアプリのURLは変えずにこの新しい書き込み先に切り替わります。
 * （okojin_app.html 側のGAS_URLは変更不要です）
 *
 * 今回追加した承認フローを使うには、保存後に以下も一度だけ行ってください：
 *   1. 関数選択のプルダウンで setupLineApprovalColumns を選び、▶実行（見出しの追加・チェックボックス化）
 *   2. 左サイドバー「トリガー」→「トリガーを追加」
 *        実行する関数: onLineApprovalEdit
 *        イベントのソース: スプレッドシートから
 *        イベントの種類: 編集時
 *      で保存（初回のみ権限の承認が必要）
 *
 * このスクリプトは openById() で対象スプレッドシートを直接指定しているため、
 * どのGoogleアカウントでスクリプトを実行していても、そのアカウントが対象スプレッドシートに
 * 編集権限を持ってさえいれば書き込めます（このスクリプト自体が対象シートに紐づいている必要はありません）。
 *
 * 【申請者へのLINE案内メール（承認制）】
 * フォーム送信時点ではLINE案内メールは送らず、スプレッドシートに登録するだけにする。
 * 幹事がO列「LINE案内」のチェックボックスにチェックを入れると、onLineApprovalEditが発火し、
 * その場で申請者本人へQRコード付きの参加案内メールを送信し、P列に送信日時を記録する。
 */

const SPREADSHEET_ID = '1NWLLHauvqE2zRVh31BYsORY48JoqqaTD';
const SHEET_GID = 2013538450; // 名簿タブのgid
const LINE_GROUP_URL = 'https://line.me/ti/g/HxtSBb8hAe'; // 大高人LINEグループ参加リンク

// 列番号（1始まり）
const COL_EMAIL = 14;        // N列
const COL_LINE_APPROVE = 15; // O列（チェックボックス）
const COL_LINE_SENT_AT = 16; // P列（送信日時）

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getTargetSheet_();
    console.log('対象シート取得OK: name=%s, sheetId=%s, spreadsheetId=%s',
      sheet.getName(), sheet.getSheetId(), sheet.getParent().getId());

    const nextNo = getNextNo_(sheet);
    console.log('採番結果: %s (追記前の最終行=%s)', nextNo, sheet.getLastRow());

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
      false,                    // O LINE案内（未承認）
      '',                       // P LINE案内送信日時（未送信）
    ]);

    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, COL_LINE_APPROVE).insertCheckboxes();

    console.log('appendRow完了: No=%s (行%s)', nextNo, lastRow);
    notifyAdmin_(data, nextNo);
    // LINE案内メールはここでは送らない。幹事がO列を承認チェックした時点で送信される（onLineApprovalEdit）。

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success', no: nextNo }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    console.error('doPostでエラー: %s\n%s', err.message, err.stack);
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * スプレッドシートの「編集時」に発火するインストーラブルトリガー用関数。
 * O列（LINE案内）のチェックボックスがONにされたら、その行の申請者へ
 * LINEグループ案内メールを送信し、P列に送信日時を記録する。
 *
 * 事前に「トリガー」画面で、この関数をイベントの種類「編集時」として
 * 手動で登録しておく必要がある（このコードを保存しただけでは動かない）。
 */
function onLineApprovalEdit(e) {
  if (!e || !e.range) return;

  const range = e.range;
  const sheet = range.getSheet();

  // 対象シート以外・O列以外の編集は無視
  if (sheet.getSheetId() !== SHEET_GID) return;
  if (range.getColumn() !== COL_LINE_APPROVE) return;

  const row = range.getRow();
  if (row === 1) return; // 見出し行は無視

  const checked = range.getValue() === true;
  if (!checked) return; // チェックを外した時は何もしない

  // すでに送信済みなら二重送信しない
  const sentAtCell = sheet.getRange(row, COL_LINE_SENT_AT);
  if (sentAtCell.getValue()) {
    console.log('行%sはすでに送信済みのためスキップ', row);
    return;
  }

  const data = getRowData_(sheet, row);
  if (!data.email) {
    sentAtCell.setValue('送信失敗（メールアドレス未入力）');
    return;
  }

  const success = sendWelcomeEmail_(data);
  sentAtCell.setValue(success ? new Date() : '送信失敗（実行数ログを確認してください）');
}

/**
 * 名簿シートの指定行から、フォームの項目名に対応するデータを読み取る。
 */
function getRowData_(sheet, row) {
  const values = sheet.getRange(row, 1, 1, COL_EMAIL).getValues()[0];
  return {
    no: values[0],
    name: values[4],
    furigana: values[5],
    graduYear: values[6],
    job: values[7],
    currentJob: values[8],
    career: values[9],
    university: values[10],
    clubActivity: values[11],
    univReason: values[12],
    email: values[13],
  };
}

/**
 * 一度だけ手動実行するセットアップ関数。
 * O列・P列に見出しを設定し、O列の既存行をチェックボックス形式にする。
 * （Apps Scriptエディタの関数選択プルダウンから選んで▶実行する）
 */
function setupLineApprovalColumns() {
  const sheet = getTargetSheet_();

  sheet.getRange(1, COL_LINE_APPROVE).setValue('LINE案内');
  sheet.getRange(1, COL_LINE_SENT_AT).setValue('LINE案内送信日時');

  const lastRow = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(2, COL_LINE_APPROVE, lastRow - 1, 1).insertCheckboxes();

  console.log('LINE案内列のセットアップが完了しました');
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
      `内容を確認し、LINEグループに案内してよければ名簿シートのO列「LINE案内」に\n` +
      `チェックを入れてください。その場で本人へ参加案内メールが送信されます。\n\n` +
      `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit?gid=${SHEET_GID}`,
  });
}

/**
 * 申請者本人へ、大高人グループLINEの参加案内（QRコード付き）をメール送信する。
 * QRコードは外部API（api.qrserver.com）でLINE_GROUP_URLから都度生成している。
 * 呼び出し元（onLineApprovalEdit）が送信日時を記録できるよう、成否をboolean で返す。
 */
function sendWelcomeEmail_(data) {
  if (!data.email) return false;

  try {
    let qrBlob = null;
    try {
      const qrApiUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data='
        + encodeURIComponent(LINE_GROUP_URL);
      qrBlob = UrlFetchApp.fetch(qrApiUrl).getBlob().setName('line_qr.png');
    } catch (qrErr) {
      console.error('QRコード生成に失敗（リンクのみで案内を送信します）: %s', qrErr.message);
    }

    const htmlBody = `
      <div style="font-family: sans-serif; line-height:1.8; color:#222;">
        <p>${data.name || ''} 様</p>
        <p>大高人への入会申請ありがとうございます。<br>
        下記より大高人グループLINEにご参加ください。</p>
        ${qrBlob ? '<p><img src="cid:lineQr" width="240" height="240" alt="LINEグループ参加用QRコード"></p>' : ''}
        <p>
          <a href="${LINE_GROUP_URL}"
             style="display:inline-block;padding:12px 24px;background:#06C755;color:#ffffff;
                    text-decoration:none;border-radius:6px;font-weight:bold;">
            LINEグループに参加する
          </a>
        </p>
        <p style="font-size:12px;color:#666;">
          ボタンが機能しない場合は、以下のURLをブラウザで開くか、QRコードを別の端末で読み取ってください。<br>
          ${LINE_GROUP_URL}
        </p>
      </div>
    `;

    const options = {
      htmlBody: htmlBody,
      name: '大高人',
    };
    if (qrBlob) {
      options.inlineImages = { lineQr: qrBlob };
    }

    MailApp.sendEmail({
      to: data.email,
      subject: '【大高人】グループLINEへのご案内',
      body: 'LINEグループへの参加はこちらから: ' + LINE_GROUP_URL, // htmlBody非対応クライアント向けの代替テキスト
      ...options,
    });

    console.log('参加者へのLINE案内メールを送信しました: %s', data.email);
    return true;
  } catch (err) {
    console.error('参加者へのLINE案内メール送信に失敗: %s', err.message);
    return false;
  }
}
