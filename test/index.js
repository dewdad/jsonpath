import test from 'tape';
import query from '../src';
import tokenizer from '../src/tokenizer';
import parser from '../src/parser';
import maybe from '../src/maybe';
import { isPlainObject, isObject } from '../src/utils';

const data = require('./data.json');

const getTime = () => {
  const hr = process.hrtime();
  return (hr[0] * 1e9 + hr[1]) / 1e6;
};

const measure = (name, fn, ...args) => {
  const before = getTime();
  const result = fn(...args);
  const after = getTime();
  console.log(`${name} took: ${after - before}ms`);
  return result;
};

const runQueries = (test, queries, expected) => {
  test.plan(queries.length);
  queries.forEach(q => {
    const qy = measure(`parse: '${q}'`, query, q);
    const result = measure(`query: '${q}'`, qy, data);
    test.deepEquals(result, expected, `'${q}' should return expected results`);
  });
};

test('tokenizer', t => {
  t.plan(1);
  t.throws(() => tokenizer('@'), /Found no matching rule: @/, 'should throw an error');
});

test('parser', t => {
  t.plan(1);
  t.throws(() => parser([ { type: 'foo' } ]), /Unknown token type: foo/, 'should throw an error');
});

test('maybe', t => {
  t.plan(4);
  const m1 = maybe(3);
  const m2 = maybe();
  const plusOne = x => x + 1;
  const timesTwo = x => x * 2;
  t.equal(4, m1.bind(plusOne), 'should return the value inside');
  t.equal(6, m1.map(timesTwo).get(), 'should return the value wrapped');
  t.equal(m2, m2.bind(timesTwo), 'should return the same instance');
  t.equal(m2, m2.map(plusOne), 'should return the same instance');
});

test('isPlainObject - constructor not a function', t => {
  t.plan(1);
  const obj = { constructor: 'wot' };
  t.notOk(isPlainObject(obj), 'should return false');
});

test('isPlainObject - constructor null prototype', t => {
  t.plan(1);
  function f() {};
  f.prototype = null;
  const obj = { constructor: f };
  t.notOk(isPlainObject(obj), 'should return false');
});

test('isPlainObject - constructor no isPrototypeOf', t => {
  t.plan(1);
  function f() {};
  delete f.prototype.isPrototypeOf;
  const obj = { constructor: f };
  t.notOk(isPlainObject(obj), 'should return false');
});

test('isObject', t => {
  t.plan(2);
  t.notOk(isObject(2), 'should return false');
  t.ok(isObject({}), 'should return true');
});

test('cached queries', t => {
  const expected = data.store.book[3];
  const queries = [
    '$..book[(@.length-1)]',
    '$..book[(@.length-1)]'
  ];
  runQueries(t, queries, expected);
});

test('recurse failure', t => {
  const expected = data;
  const queries = [
    '$..'
  ];
  runQueries(t, queries, expected);
});

test('get root', t => {
  const expected = data;
  const queries = [
    '$'
  ];
  runQueries(t, queries, expected);
});

test('get wildcard', t => {
  const expected = data.store;
  const queries = [
    '$.store.*'
  ];
  runQueries(t, queries, expected);
});

test('get expr', t => {
  const expected = data.store.book[3];
  const queries = [
    '$..book[(@.length-1)]'
  ];
  runQueries(t, queries, expected);
});

test('get fexpr', t => {
  const expected = data.store.book.filter(x => x.price > 20);
  const queries = [
    '$..book[?(@.price > 20)]'
  ];
  runQueries(t, queries, expected);
});

test('get mexpr', t => {
  const expected = data.store.book.map(x => x.title);
  const queries = [
    '$..book[!(@.title)]'
  ];
  runQueries(t, queries, expected);
});

test('get coerce/mexpr', t => {
  const expected = data.store.book.map(x => String(x.price));
  const queries = [
    '$..book[!(String(@.price))]',
    '$..book.price<String>'
  ];
  runQueries(t, queries, expected);
});

test('coerce <String>', t => {
  t.plan(1);
  const expected = '10.25';
  const result = query('$.a<String>', { a: 10.25 });
  t.equal(result, expected, 'should coerce to String');
});

test('coerce <float>', t => {
  t.plan(1);
  const expected = 10.25;
  const result = query('$.a<float>', { a: '10.25' });
  t.equal(result, expected, 'should coerce to float');
});

test('coerce <int>', t => {
  t.plan(1);
  const expected = 10;
  const result = query('$.a<int>', { a: '10.25' });
  t.equal(result, expected, 'should coerce to int');
});

test('coerce <Number>', t => {
  t.plan(1);
  const expected = 10.4545;
  const result = query('$.a<Number>', { a: '10.4545' });
  t.equal(result, expected, 'should coerce to Number');
});

test('get slice/union', t => {
  const expected = data.store.book.slice(1, 4);
  const queries = [
    '$..book[1:4]',
    '$..book[1,2,3]'
  ];
  runQueries(t, queries, expected);
});

test('slice - no start', t => {
  const expected = data.store.book.slice(0, 1);
  const queries = [
    '$..book[:1]'
  ];
  runQueries(t, queries, expected);
});

test('slice - no end', t => {
  const expected = data.store.book.slice(1);
  const queries = [
    '$..book[1:]'
  ];
  runQueries(t, queries, expected);
});

test('mexpr - non-array', t => {
  const expected = data.store.bicycle.price * 2;
  const queries = [
    '$.store.bicycle[!(@.price * 2)]'
  ];
  runQueries(t, queries, expected);
});

test('get all authors', t => {
  const expected = [ 'Nigel Rees', 'Evelyn Waugh', 'Herman Melville', 'J. R. R. Tolkien' ];
  const queries = [
    '$..book.author',
    '$..author'
  ];
  runQueries(t, queries, expected);
});

test('get specific author', t => {
  const expected = [ 'Nigel Rees' ];
  const queries = [
    '$..book.0.author',
    '$..book[?(@.price === 8.95)].author',
    '$..author[?(@.startsWith("Nigel"))]',
    '$.store.book[0].author'
  ];
  runQueries(t, queries, expected);
});

test('get specific author, title', t => {
  const expected = [
    [ 'Nigel Rees', 'Sayings of the Century' ],
    [ 'Herman Melville', 'Moby Dick' ]
  ];
  const queries = [
    '$..book[?(@.price < 10)]["author","title"]',
    '$..book[?(@.title.toLowerCase().indexOf("c") > -1)]["author","title"]',
  ];
  runQueries(t, queries, expected);
});

test('get specific author, title as object', t => {
  const expected = [
    {
      author: 'Nigel Rees',
      title: 'Sayings of the Century'
    },
    {
      author: 'Herman Melville',
      title: 'Moby Dick'
    }
  ];
  const queries = [
    '$..book[?(@.price < 10)]{"author","title"}',
    '$..book[?(@.title.toLowerCase().indexOf("c") > -1)]{"author","title"}',
  ];
  runQueries(t, queries, expected);
});

test('get bicycle with member', t => {
  const expected = [ 'red' ];
  const queries = [
    '$.store.bicycle["color"]'
  ];
  runQueries(t, queries, expected);
});

test('get bicycle with omember', t => {
  const expected = { color: 'red' };
  const queries = [
    '$.store.bicycle{"color"}'
  ];
  runQueries(t, queries, expected);
});