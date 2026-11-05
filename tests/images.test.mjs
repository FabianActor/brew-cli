import test from 'node:test';
import assert from 'node:assert/strict';

import { describeImageSize, describeImages, isImageDataUrl, redactImages } from '../src/lib/images.ts';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('isImageDataUrl only accepts inline image data urls', () => {
  assert.equal(isImageDataUrl(TINY_PNG), true);
  assert.equal(isImageDataUrl('data:text/plain;base64,aGk='), false);
  assert.equal(isImageDataUrl('https://example.com/a.png'), false);
  assert.equal(isImageDataUrl(undefined), false);
});

test('describeImageSize reports readable sizes from the base64 payload', () => {
  assert.equal(describeImageSize('data:image/png;base64,AAAA'), '3 B');
  assert.equal(describeImageSize(`data:image/jpeg;base64,${'A'.repeat(200_000)}`), '146 KB');
  assert.equal(describeImageSize(`data:image/jpeg;base64,${'A'.repeat(2_000_000)}`), '1.4 MB');
});

test('redactImages swaps base64 for a size placeholder and leaves the input untouched', () => {
  const record = { id: 'bean_1', name: '楠迪庄园', image: TINY_PNG, backImage: TINY_PNG, notes: 'ok' };
  const shown = redactImages(record, ['image', 'backImage']);

  assert.equal(record.image, TINY_PNG, '原文不能改');
  assert.match(String(shown.image), /^\[image \d+ B/);
  assert.match(String(shown.image), /--with-images/);
  assert.equal(shown.name, '楠迪庄园');
  assert.equal(shown.notes, 'ok');
});

test('redactImages returns the same object when there is nothing to hide', () => {
  const record = { id: 'bean_1', name: '楠迪庄园', image: '' };
  assert.equal(redactImages(record, ['image']), record);
});

test('describeImages lists only the fields that actually hold images', () => {
  const record = { image: TINY_PNG, backImage: undefined };
  const lines = describeImages(record, ['image', 'backImage']);

  assert.equal(lines.length, 1);
  assert.match(lines[0], /^image \d+ B$/);
  assert.deepEqual(describeImages({ image: '' }, ['image']), []);
});
