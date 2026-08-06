import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ExcelJS, {
  type DataBarRuleType,
} from 'exceljs';

type PackageMetadata = {
  name?: string;
  version?: string;
};

/*
 * ExcelJS 4.4.0の実装はdataBarのcolorを扱うが、
 * 公開されているDataBarRuleTypeにはcolorが含まれていない。
 * ランタイム仕様との差だけをテスト内で補完する。
 */
type RuntimeDataBarRule = DataBarRuleType & {
  color: {
    argb: string;
  };
};

function findPackageVersion(
  entryPath: string,
  expectedName: string,
): string {
  let directory = path.dirname(entryPath);

  while (true) {
    const packagePath = path.join(
      directory,
      'package.json',
    );

    if (fs.existsSync(packagePath)) {
      const metadata = JSON.parse(
        fs.readFileSync(packagePath, 'utf8'),
      ) as PackageMetadata;

      if (
        metadata.name === expectedName
        && typeof metadata.version === 'string'
      ) {
        return metadata.version;
      }
    }

    const parent = path.dirname(directory);

    if (parent === directory) {
      throw new Error(
        `${expectedName}のpackage.jsonが見つかりません。`,
      );
    }

    directory = parent;
  }
}

function loadUuidFromExcelJS() {
  const appRequire = createRequire(import.meta.url);
  const exceljsEntry = appRequire.resolve('exceljs');
  const requireFromExcelJS =
    createRequire(exceljsEntry);

  const uuidEntry =
    requireFromExcelJS.resolve('uuid');

  const uuid = requireFromExcelJS('uuid') as {
    v4?: () => string;
  };

  return {
    uuid,
    version: findPackageVersion(
      uuidEntry,
      'uuid',
    ),
  };
}

test(
  'ExcelJS配下ではoverrideしたuuid 11.1.1を利用する',
  () => {
    const { uuid, version } =
      loadUuidFromExcelJS();

    assert.equal(version, '11.1.1');
    assert.equal(typeof uuid.v4, 'function');

    const generatedUuid = uuid.v4?.();

    assert.equal(
      typeof generatedUuid,
      'string',
    );
    assert.match(
      generatedUuid ?? '',
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  },
);

test(
  'uuidを使う条件付き書式を含むExcelを生成して再読込できる',
  async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet =
      workbook.addWorksheet('年間ロードマップ');

    worksheet.columns = [
      {
        header: '手続き名',
        key: 'procedureName',
        width: 32,
      },
      {
        header: '進捗',
        key: 'progress',
        width: 12,
      },
    ];

    worksheet.addRows([
      {
        procedureName: '法人税確定申告',
        progress: 10,
      },
      {
        procedureName: '社会保険新規適用届',
        progress: 20,
      },
      {
        procedureName: '労働保険年度更新',
        progress: 30,
      },
    ]);

    /*
     * ExcelJSがuuid.v4()を使用する経路。
     * override更新時にCommonJS互換性が壊れていないことも確認する。
     */
    const dataBarRule: RuntimeDataBarRule = {
      type: 'dataBar',
      priority: 1,
      cfvo: [
        { type: 'min' },
        { type: 'max' },
      ],
      color: {
        argb: 'FF638EC6',
      },
    };

    worksheet.addConditionalFormatting({
      ref: 'B2:B4',
      rules: [dataBarRule],
    });

    const buffer =
      await workbook.xlsx.writeBuffer();

    assert.ok(
      buffer.byteLength > 0,
      '生成されたExcelバッファが空です。',
    );

    const reloadedWorkbook =
      new ExcelJS.Workbook();

    await reloadedWorkbook.xlsx.load(buffer);

    const reloadedWorksheet =
      reloadedWorkbook.getWorksheet(
        '年間ロードマップ',
      );

    assert.ok(
      reloadedWorksheet,
      '年間ロードマップシートを再読込できません。',
    );

    assert.equal(
      reloadedWorksheet.getCell('A2').value,
      '法人税確定申告',
    );
    assert.equal(
      reloadedWorksheet.getCell('B4').value,
      30,
    );
  },
);
