// APIキーはスクリプトプロパティに保存してください。
// GASエディタ → プロジェクトの設定 → スクリプトプロパティ
//   キー: CLAUDE_API_KEY  値: sk-ant-api03-...（実際のキー）

const KEYS         = ['cls','num','name','ai1','ai2','ai3','future','idea','dt','job','kizuki','hansei','nack5','kizuki1','stadium','presentationUrl'];
const HEADER       = ['クラス','番号','氏名','AI場面①','AI場面②','AI場面③','AIが進化したら','アイデア','提出日時','将来の夢・職業','気づき（事前課題終了時点）','AIと話してみて','NACK5ビジネスアイデア','気づき（第１回授業後）','スタジアム実験プラン（個人）','プレゼン資料'];
const GROUP_KEYS   = ['gname','idea','reason','nack5','dt'];
const GROUP_HEADER = ['グループ名','選んだアイデア','選んだ理由','NACK5見学で確かめたいこと','提出日時'];

const CONTACT_SHEET  = '問い合わせ';
const CONTACT_HEADER = ['クラス', '番号', '氏名', 'メールアドレス', '問い合わせ内容', '提出日時'];
const CONTACT_NOTIFY_TO = 'asaki@umeasaki.com';

const SCHEDULE_SHEET = '梅澤先生との日程調整';
const SCHEDULE_SLOTS = [
  { datetime: '8/19 18:00-19:00', meet: 'https://meet.google.com/cvh-rbcq-tbq' },
  { datetime: '8/20 18:00-19:00', meet: 'https://meet.google.com/ozg-nfie-qad' },
  { datetime: '8/22 14:00-15:00', meet: 'https://meet.google.com/oiu-nysc-exv' },
  { datetime: '8/23 14:00-15:00', meet: 'https://meet.google.com/mji-yyvg-xfh' },
  { datetime: '8/24 18:00-19:00', meet: 'https://meet.google.com/ajd-sjio-csz' },
  { datetime: '8/25 18:00-19:00', meet: 'https://meet.google.com/iaq-jiom-njz' },
  { datetime: '8/26 18:00-19:00', meet: 'https://meet.google.com/agd-ndwh-xfd' },
  { datetime: '8/28 18:00-19:00', meet: 'https://meet.google.com/nzt-kgzr-ssq' },
  { datetime: '8/30 11:00-12:00', meet: 'https://meet.google.com/ssz-gyqj-ffo' },
  { datetime: '8/30 14:00-15:00', meet: 'https://meet.google.com/buz-sxuc-hwe' },
  { datetime: '8/30 15:00-16:00', meet: 'https://meet.google.com/meo-tawq-opa' },
  { datetime: '8/31 18:00-19:00', meet: 'https://meet.google.com/bky-vdwh-ncy' }
];

const PRESENTATION_SHEET  = '最終プレゼン';
const PRESENTATION_HEADER = ['クラス', '番号', '氏名', 'ファイル名', 'ファイルURL', 'ファイルID', '提出日時'];
const PRESENTATION_FOLDER_NAME = '大高人WS2026_最終プレゼン提出';

function ensurePresentationFolder() {
  const folders = DriveApp.getFoldersByName(PRESENTATION_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(PRESENTATION_FOLDER_NAME);
}

function ensurePresentationSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PRESENTATION_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PRESENTATION_SHEET);
    sheet.appendRow(PRESENTATION_HEADER);
  }
  return sheet;
}

function ensureScheduleSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SCHEDULE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SCHEDULE_SHEET);
    sheet.appendRow(['日時', 'Meetリンク', '予約グループ', '更新日時']);
    SCHEDULE_SLOTS.forEach(function (s) { sheet.appendRow([s.datetime, s.meet, '', '']); });
  }
  return sheet;
}

function doPost(e) {
  const p = e.parameter;

  // 梅澤先生への問い合わせ
  if (p.action === 'contact') {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONTACT_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(CONTACT_SHEET);
      sheet.appendRow(CONTACT_HEADER);
    }
    sheet.appendRow([
      p.cls || '',
      p.num || '',
      p.name || '',
      p.email || '',
      p.message || '',
      new Date().toLocaleString('ja-JP')
    ]);
    try {
      MailApp.sendEmail({
        to: CONTACT_NOTIFY_TO,
        subject: '【大高人WS】新しい問い合わせがあります（' + (p.name || '') + 'さん）',
        body:
          'クラス: ' + (p.cls || '') + '\n' +
          '番号: ' + (p.num || '') + '\n' +
          '氏名: ' + (p.name || '') + '\n' +
          'メールアドレス: ' + (p.email || '') + '\n\n' +
          '問い合わせ内容:\n' + (p.message || '')
      });
    } catch (err) {
      // 通知メールの失敗で問い合わせ自体の保存を止めない
      Logger.log('問い合わせ通知メールの送信に失敗しました: ' + err);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 最終プレゼン資料の提出
  if (p.action === 'uploadPresentation') {
    try {
      const cls = p.cls || '';
      const num = p.num || '';
      const name = p.name || '';
      const filename = p.filename || 'presentation.pptx';
      const mimeType = p.mimeType || 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

      if (!p.fileData) {
        throw new Error('ファイルデータが送信されていません（fileDataが空です）');
      }

      const sheet = ensurePresentationSheet();
      const data = sheet.getDataRange().getValues();
      let targetRow = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === cls && String(data[i][1]) === num) { targetRow = i + 1; break; }
      }

      // 既に提出済みなら、古いファイルは破棄してから新しいファイルに差し替える
      if (targetRow > 0) {
        const oldFileId = data[targetRow - 1][5];
        if (oldFileId) {
          try { DriveApp.getFileById(oldFileId).setTrashed(true); } catch (err) {
            Logger.log('古いファイルの削除に失敗しました: ' + err);
          }
        }
      }

      const bytes = Utilities.base64Decode(p.fileData);
      const blob = Utilities.newBlob(bytes, mimeType, filename);
      const folder = ensurePresentationFolder();
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      const row = [cls, num, name, filename, file.getUrl(), file.getId(), new Date().toLocaleString('ja-JP')];
      if (targetRow > 0) {
        sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
      } else {
        sheet.appendRow(row);
      }

      // 既存の「回答」シートにも、プレゼン資料を開けるリンクを1列反映する
      try {
        const mainSheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
        if (mainSheet.getLastRow() > 0) {
          const lastCol = mainSheet.getLastColumn();
          if (lastCol < HEADER.length) {
            mainSheet.getRange(1, lastCol + 1, 1, HEADER.length - lastCol)
                     .setValues([HEADER.slice(lastCol)]);
          }
          const mainData = mainSheet.getDataRange().getValues();
          let mainRow = -1;
          for (let i = 1; i < mainData.length; i++) {
            if (String(mainData[i][0]) === cls && String(mainData[i][1]) === num) { mainRow = i + 1; break; }
          }
          if (mainRow > 0) {
            const col = KEYS.indexOf('presentationUrl') + 1;
            mainSheet.getRange(mainRow, col).setFormula('=HYPERLINK("' + file.getUrl() + '","開く")');
          }
        }
      } catch (err) {
        // 回答シートへの反映に失敗しても、提出自体は成功として扱う
        Logger.log('回答シートへのプレゼン資料リンク反映に失敗しました: ' + err);
      }

      return ContentService
        .createTextOutput(JSON.stringify({ result: 'success', url: file.getUrl() }))
        .setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
      // ここで捕まえてJSONで返すことで、アプリ画面にエラー内容を表示できるようにする
      Logger.log('プレゼン資料のアップロードに失敗しました: ' + err);
      return ContentService
        .createTextOutput(JSON.stringify({ result: 'error', message: String(err) }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // グループワーク送信
  if (p.action === 'group') {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('グループワーク');
    if (!sheet) {
      sheet = ss.insertSheet('グループワーク');
      sheet.appendRow(GROUP_HEADER);
    }
    // グループ名で既存行を検索して上書き
    const data = sheet.getDataRange().getValues();
    let targetRow = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(p.gname || '')) { targetRow = i + 1; break; }
    }
    if (targetRow > 0) {
      GROUP_KEYS.forEach((k, i) => {
        if (Object.prototype.hasOwnProperty.call(p, k)) {
          sheet.getRange(targetRow, i + 1).setValue(p[k]);
        }
      });
    } else {
      sheet.appendRow(GROUP_KEYS.map(k => p[k] || ''));
    }
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 生徒フォーム送信
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER);
  } else {
    const lastCol = sheet.getLastColumn();
    if (lastCol < HEADER.length) {
      sheet.getRange(1, lastCol + 1, 1, HEADER.length - lastCol)
           .setValues([HEADER.slice(lastCol)]);
    }
  }

  const cls = p.cls || '';
  const num = p.num || '';

  const data = sheet.getDataRange().getValues();
  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(cls) && String(data[i][1]) === String(num)) {
      targetRow = i + 1; break;
    }
  }

  if (targetRow > 0) {
    KEYS.forEach((k, i) => {
      if (Object.prototype.hasOwnProperty.call(p, k)) {
        sheet.getRange(targetRow, i + 1).setValue(p[k]);
      }
    });
  } else {
    const row = KEYS.map(k => p[k] || '');
    sheet.appendRow(row);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ result: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const action   = e && e.parameter && e.parameter.action;
  const callback = e && e.parameter && e.parameter.callback;

  if (action === 'group') {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('グループワーク');
    const records = [];
    if (sheet && sheet.getLastRow() > 1) {
      const data = sheet.getDataRange().getValues();
      data.slice(1).forEach(row => {
        const obj = {};
        GROUP_KEYS.forEach((k, i) => { obj[k] = String(row[i] == null ? '' : row[i]); });
        records.push(obj);
      });
    }
    const json = JSON.stringify(records);
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + json + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'schedule') {
    const sheet = ensureScheduleSheet();
    const data  = sheet.getDataRange().getValues();
    const records = data.slice(1).map(function (row) {
      return {
        datetime: String(row[0] == null ? '' : row[0]),
        meet:     String(row[1] == null ? '' : row[1]),
        group:    String(row[2] == null ? '' : row[2])
      };
    });
    const json = JSON.stringify(records);
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + json + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'scheduleBook' || action === 'scheduleCancel') {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    let result;
    try {
      const sheet = ensureScheduleSheet();
      const data  = sheet.getDataRange().getValues();
      const datetime = e.parameter.datetime || '';
      const group    = e.parameter.group || '';

      let targetRow = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === datetime) { targetRow = i + 1; break; }
      }

      if (targetRow < 0) {
        result = { result: 'error', message: 'slot not found' };
      } else if (action === 'scheduleBook') {
        const currentGroup = String(data[targetRow - 1][2] == null ? '' : data[targetRow - 1][2]);
        if (currentGroup && currentGroup !== group) {
          result = { result: 'conflict', group: currentGroup };
        } else {
          // 1グループにつき1枠までのため、他に予約していた枠があれば解除してから予約する
          for (let i = 1; i < data.length; i++) {
            if (i + 1 !== targetRow && String(data[i][2] == null ? '' : data[i][2]) === group) {
              sheet.getRange(i + 1, 3).setValue('');
              sheet.getRange(i + 1, 4).setValue('');
            }
          }
          sheet.getRange(targetRow, 3).setValue(group);
          sheet.getRange(targetRow, 4).setValue(new Date().toLocaleString('ja-JP'));
          result = { result: 'success' };
        }
      } else {
        const currentGroup = String(data[targetRow - 1][2] == null ? '' : data[targetRow - 1][2]);
        if (currentGroup === group) {
          sheet.getRange(targetRow, 3).setValue('');
          sheet.getRange(targetRow, 4).setValue('');
        }
        result = { result: 'success' };
      }
    } finally {
      lock.releaseLock();
    }
    const json = JSON.stringify(result);
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + json + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'presentations') {
    const sheet = ensurePresentationSheet();
    const data  = sheet.getDataRange().getValues();
    const records = data.length <= 1 ? [] : data.slice(1).map(function (row) {
      const fileId = row[5];
      let thumbnail = '';
      if (fileId) {
        try {
          const thumb = DriveApp.getFileById(fileId).getThumbnail();
          if (thumb) {
            thumbnail = 'data:' + thumb.getContentType() + ';base64,' + Utilities.base64Encode(thumb.getBytes());
          }
        } catch (err) {
          // アップロード直後などサムネイルがまだ生成されていない場合は空のまま返す
          Logger.log('サムネイル取得に失敗しました: ' + err);
        }
      }
      return {
        cls: String(row[0] == null ? '' : row[0]),
        num: String(row[1] == null ? '' : row[1]),
        name: String(row[2] == null ? '' : row[2]),
        filename: String(row[3] == null ? '' : row[3]),
        url: String(row[4] == null ? '' : row[4]),
        dt: String(row[6] == null ? '' : row[6]),
        thumbnail: thumbnail
      };
    });
    const json = JSON.stringify(records);
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + json + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'analyze') {
    const result = doAnalysis(e);
    const text   = result.getContent();
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + text + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return result;
  }

  if (action === 'analyzeAdvice') {
    const result = doAdviceAnalysis(e);
    const text   = result.getContent();
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + text + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return result;
  }

  if (action === 'analyzeDream') {
    const result = doDreamAnalysis(e);
    const text   = result.getContent();
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + text + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return result;
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const data  = sheet.getDataRange().getValues();
  const records = data.length <= 1 ? [] : data.slice(1).map(row => {
    const obj = {};
    KEYS.forEach((k, i) => { obj[k] = String(row[i] == null ? '' : row[i]); });
    return obj;
  });

  const json = JSON.stringify(records);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function analyzeWithClaude(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!apiKey) throw new Error('スクリプトプロパティに CLAUDE_API_KEY が設定されていません');

  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = JSON.parse(response.getContentText());
  return data.content[0].text;
}

function doAnalysis(e) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const data  = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'データがありません' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const records = data.slice(1).map(row => {
    const obj = {};
    KEYS.forEach((k, i) => { obj[k] = String(row[i] == null ? '' : row[i]); });
    return obj;
  });

  const prompt = `あなたは高校生の探究学習を支援するAIです。
以下は埼玉県立大宮高校の生徒たちの事前課題・当日のワークショップの回答です。

【回答データ】
${records.map((r, i) => `
[${i + 1}] ${r.name}（${r.grade}年${r.cls}組${r.num}番）
・AIが使われている場面：${r.ai1}、${r.ai2}、${r.ai3}
・もしAIが進化したら：${r.future}
・アイデア：${r.idea}${r.job ? `\n・将来の夢・職業：${r.job}` : ''}${r.kizuki ? `\n・発表を聞いた後の気づき：${r.kizuki}` : ''}
`).join('\n')}

上記の回答を分析して、以下の形式でJSONのみを返してください（前置き・後書き・コードブロック不要）：

{"groups":[{"name":"グループ名（10文字以内）","members":["氏名1","氏名2"],"summary":"このグループの傾向・共通点の要約（100字程度）"}],"overall":"全体の傾向・大宮高校生の特徴についてのコメント（150字程度）。「気づき」が記入されている生徒が多い場合は、対話を通じてどのような視点の変化が見られたかにも触れてください。"}

グループは2〜5個程度に分類してください。`;

  const result = analyzeWithClaude(prompt);
  return ContentService
    .createTextOutput(JSON.stringify({ result: result }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doAdviceAnalysis(e) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const data  = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'データがありません' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const records = data.slice(1).map(row => {
    const obj = {};
    KEYS.forEach((k, i) => { obj[k] = String(row[i] == null ? '' : row[i]); });
    return obj;
  });

  const prompt = `あなたは高校生の探究学習・デザイン思考ワークショップの授業設計の専門家です。
以下は埼玉県立大宮高校1年生の事前課題の回答データです。

【生徒の回答データ】
${records.map((r, i) => `[${i+1}] ${r.name}
・AI場面：${r.ai1}、${r.ai2}、${r.ai3}
・もしAIが進化したら：${r.future}
・アイデア：${r.idea}
・将来の夢：${r.job || '未記入'}`).join('\n\n')}

このクラスの回答傾向をふまえ、以下の4つのPhaseそれぞれについて授業アドバイスをJSONのみで返してください（前置き・後書き・コードブロック不要）：

Phase 0: 事前課題（実施済み）
Phase 1: 座学90分（問いを立てる・グループワーク）
Phase 2: NACK5スタジアム見学（フィールドワーク）
Phase 3: プレゼン90分（発表・振り返り）

{"phases":[
  {
    "title": "Phaseのタイトル（例：事前課題 ― 違和感の言語化）",
    "goal": "このPhaseのねらいを1〜2文で（このクラスの回答傾向をふまえて具体的に）",
    "activities": ["推奨アクティビティや進行アドバイスを3〜5個の箇条書き（このクラスに合わせた具体的な内容）"],
    "insight": "生徒の回答から見えたこのクラスならではの特徴・注意点（100字程度）"
  }
]}

4つのPhaseすべてを含めてください。`;

  const result = analyzeWithClaude(prompt);
  return ContentService
    .createTextOutput(JSON.stringify({ result: result }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doDreamAnalysis(e) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const data  = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'データがありません' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const records = data.slice(1).map(row => {
    const obj = {};
    KEYS.forEach((k, i) => { obj[k] = String(row[i] == null ? '' : row[i]); });
    return obj;
  }).filter(r => r.job && r.job.trim() !== '');

  if (records.length === 0) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: '将来の夢・職業のデータがまだありません' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const prompt = `あなたは高校生の探究学習を支援するAIです。
以下は埼玉県立大宮高校の生徒たちの「将来の夢・職業」の回答です。

【回答データ】
${records.map((r, i) => `[${i + 1}] ${r.name}（${r.grade}年${r.cls}組${r.num}番）：${r.job}`).join('\n')}

上記の回答を分析して、以下の形式でJSONのみを返してください（前置き・後書き・コードブロック不要）：

{"groups":[{"name":"グループ名（10文字以内）","members":["氏名1","氏名2"],"summary":"このグループの共通点・傾向の説明（100字程度）"}],"overall":"全体の傾向についてのコメント（150字程度）。大宮高校生の将来の夢にどのような特徴や多様性があるか、AIへの関心との関連があれば触れてください。"}

似た方向性の夢・職業でグループ分けし、2〜5個のグループにまとめてください。`;

  const result = analyzeWithClaude(prompt);
  return ContentService
    .createTextOutput(JSON.stringify({ result: result }))
    .setMimeType(ContentService.MimeType.JSON);
}
