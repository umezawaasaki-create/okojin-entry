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
 *
 * 【申請者への自動返信】
 * スプレッドシートへの登録後、申請者本人（フォームのメールアドレス）宛てに、
 * 大高人グループLINEの参加案内メール（QRコード付き）を自動送信する（sendWelcomeEmail_）。
 * QRコードは外部の無料API（api.qrserver.com）でLINE_GROUP_URLから都度生成している。
 */

const SPREADSHEET_ID = '1NWLLHauvqE2zRVh31BYsORY48JoqqaTD';
const SHEET_GID = 2013538450; // 名簿タブのgid
const LINE_GROUP_URL = 'https://line.me/ti/g/HxtSBb8hAe'; // 大高人LINEグループ参加リンク

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
    ]);

    console.log('appendRow完了: No=%s', nextNo);
    notifyAdmin_(data, nextNo);
    sendWelcomeEmail_(data);

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

/**
 * 申請者本人へ、大高人グループLINEの参加案内（QRコード付き）をメール送信する。
 * QRコードは外部API（api.qrserver.com）でLINE_GROUP_URLから都度生成している。
 * QR生成やメール送信に失敗しても doPost 全体は失敗させず、ログにのみ記録する
 * （スプレッドシートへの登録自体は既に完了しているため）。
 */
function sendWelcomeEmail_(data) {
  if (!data.email) return;

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
  } catch (err) {
    console.error('参加者へのLINE案内メール送信に失敗: %s', err.message);
  }
}
