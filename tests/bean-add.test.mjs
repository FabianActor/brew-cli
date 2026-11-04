import assert from 'node:assert/strict';
import test from 'node:test';

import { runCliSync } from './helpers/cli.mjs';

function getOfflineEnv() {
  return {
    BREW_GUIDE_SUPABASE_URL: '',
    BREW_GUIDE_SUPABASE_KEY: '',
    BREW_GUIDE_USER_ID: '',
  };
}

test('brew-guide bean add --dry-run prints a preview without credentials', () => {
  const result = runCliSync([
    'bean',
    'add',
    '--name',
    'X',
    '--roaster',
    'R',
    '--origin',
    'O',
    '--process',
    'P',
    '--dry-run',
  ], {
    env: getOfflineEnv(),
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[dry-run\]/i);
  assert.match(result.stdout, /"name": "X"/);
  assert.match(result.stdout, /"roaster": "R"/);
});

test('brew-guide bean add --dry-run --format json returns a structured preview', () => {
  const result = runCliSync([
    'bean',
    'add',
    '--name',
    'X',
    '--roaster',
    'R',
    '--origin',
    'O',
    '--process',
    'P',
    '--dry-run',
    '--format',
    'json',
  ], {
    env: getOfflineEnv(),
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.bean.name, 'X');
  assert.equal(payload.bean.beanType, 'filter');
  assert.equal(payload.bean.roastLevel, '浅度烘焙');
  assert.equal(payload.bean.isInTransit, true);
  assert.deepEqual(payload.bean.blendComponents, [{ origin: 'O', process: 'P' }]);
});

test('brew-guide bean add fails when no component carries an origin', () => {
  const result = runCliSync(['bean', 'add', '--name', 'Ethiopia', '--roaster', 'R'], {
    env: getOfflineEnv(),
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /缺少(产地|成分信息)/);
});

test('brew-guide bean add builds multiple components from repeated --component', () => {
  const result = runCliSync([
    'bean',
    'add',
    '--name',
    'Blend',
    '--roaster',
    'R',
    '--component',
    'origin=Peru;region=Cajamarca;process=washed;percentage=40',
    '--component',
    'origin=Brazil;process=natural;percentage=60',
    '--dry-run',
    '--format',
    'json',
  ], {
    env: getOfflineEnv(),
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.bean.blendComponents, [
    { origin: 'Peru', region: 'Cajamarca', process: 'washed', percentage: 40 },
    { origin: 'Brazil', process: 'natural', percentage: 60 },
  ]);
});

test('brew-guide bean add maps region/altitude/processing station flags into the component', () => {
  const result = runCliSync([
    'bean',
    'add',
    '--name',
    'Single',
    '--roaster',
    'R',
    '--origin',
    'Ethiopia',
    '--region',
    'Guji Hambela',
    '--estate',
    'Buku Sayisa',
    '--processing-station',
    'Buku',
    '--altitude',
    '2350-2460m',
    '--process',
    'natural',
    '--variety',
    '74158',
    '--dry-run',
    '--format',
    'json',
  ], {
    env: getOfflineEnv(),
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.bean.blendComponents, [{
    origin: 'Ethiopia',
    region: 'Guji Hambela',
    estate: 'Buku Sayisa',
    processingStation: 'Buku',
    process: 'natural',
    variety: '74158',
    altitude: '2350-2460m',
  }]);
});

test('brew-guide bean add rejects unknown --component keys', () => {
  const result = runCliSync([
    'bean',
    'add',
    '--name',
    'X',
    '--roaster',
    'R',
    '--component',
    'originn=Peru;process=washed',
    '--dry-run',
  ], {
    env: getOfflineEnv(),
  });

  assert.equal(result.status, 2);
  assert.match(`${result.stderr}${result.stdout}`, /不认识字段/);
});

test('brew-guide bean add can write to real Supabase when credentials are available', { skip: !process.env.BREW_GUIDE_SUPABASE_URL }, () => {
  const result = runCliSync([
    'bean',
    'add',
    '--name',
    'Test Bean',
    '--roaster',
    'Test',
    '--origin',
    'Test',
    '--process',
    'washed',
  ]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Created bean bean_/);
});
