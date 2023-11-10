import fsp from 'fs/promises';
import path from 'path';
import prettier from 'prettier';
import * as tsj from 'ts-json-schema-generator';
import Ajv, { ValidateFunction } from 'ajv';
// import { createMmParser } from '../../src/mmParser';
import { Database } from '../../src/mmParser/mmParseTree';
import { reverseParse } from '../../src/utils/reverseParse';
const mmFiles = [
    'https://raw.githubusercontent.com/metamath/set.mm/develop/demo0.mm',
    'https://raw.githubusercontent.com/david-a-wheeler/metamath-test/master/demo0-includer.mm',
    //    'https://raw.githubusercontent.com/metamath/set.mm/develop/set.mm',
];

let ajv: Ajv;
let validateFn: ValidateFunction;

jest.setTimeout(60 * 1000);

beforeAll(async () => {
    const tsPathWithinRepo = 'src/mmParser/mmParseTree.ts';
    const tsPath = path.join(__dirname, '../..', tsPathWithinRepo);
    const schemaGenerator = tsj.createGenerator({
        path: tsPath,
    });
    const timestamp = new Date()
        .toISOString()
        .split(':')
        .slice(0, 2)
        .join(':')
        .split('T')
        .join(' at ');

    const schema = {
        description: `Autogenerated from ${tsPathWithinRepo} on ${timestamp}`,
        ...schemaGenerator.createSchema('Database'),
    };
    const schemaString = prettier.format(JSON.stringify(schema), {
        parser: 'json',
    });

    const schemaStringForChecking = JSON.stringify({
        ...schema,
        description: undefined,
    });
    let oldSchemaStringForChecking = '';

    const schemaPath = path.join(__dirname, '../../schemas/mmSchema.json');
    try {
        oldSchemaStringForChecking = await fsp.readFile(schemaPath, {
            encoding: 'utf-8',
        });
        oldSchemaStringForChecking = JSON.stringify({
            ...JSON.parse(oldSchemaStringForChecking),
            description: undefined,
        });
    } catch {
        // This is fine.  If the schema won't load for whatever reason then we'll simply try to update it below
    }

    if (schemaStringForChecking !== oldSchemaStringForChecking) {
        await fsp.writeFile(schemaPath, schemaString);
    }

    ajv = new Ajv();
    validateFn = ajv.compile(schema);
});

mmFiles.forEach(async (url) => {
    const filename = url.split('/').pop();

    if (!filename) {
        throw new Error('Not a filename');
    }

    describe.skip(filename, () => {
        let text = '';
        const database: Database = { type: 'database', children: [] };

        beforeAll(async () => {
            // Obtain the .mm file

            const filePath = path.join(__dirname, '../../examples', filename);
            const stat = await fsp.stat(filePath).catch(() => undefined);

            if (stat) {
                text = await fsp.readFile(filePath, { encoding: 'utf-8' });
            } else {
                const response = await fetch(url);
                text = await response.text();
                await fsp.writeFile(filePath, text);
            }

            // // Parse the .mm file
            // const parser = createMmParser();
            // parser.feed(text);
            // database = parser.finish();
            // const jsonPath = path.join(
            //     __dirname,
            //     '../../examples',
            //     `${filename}.json`,
            // );

            // // Save the json file
            // await fsp.writeFile(
            //     jsonPath,
            //     prettier.format(JSON.stringify(database), { parser: 'json' }),
            // );
        });

        it('should reverse parse', () => {
            const reverseParseText = reverseParse(database);
            expect(text).toEqual(reverseParseText);
        });

        it('should conform to the schema', () => {
            const result = validateFn(database);
            const errorDump = JSON.stringify(validateFn.errors, null, 4);
            const errorText = ajv.errorsText(validateFn.errors);
            if (validateFn.errors) {
                console.error(errorDump);
                console.error(errorText);
            }
            expect(result).toEqual(true);
        });
    });
});
