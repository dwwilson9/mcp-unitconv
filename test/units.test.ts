import { test } from "node:test";
import assert from "node:assert/strict";
import {
  convert,
  BelowAbsoluteZeroError,
  DimensionMismatchError,
  UnknownUnitError,
} from "../src/units.ts";

test("length: km to m", () => {
  assert.equal(convert(1, "km", "m"), 1000);
});

test("length: mi to km", () => {
  assert.ok(Math.abs(convert(1, "mi", "km") - 1.609344) < 1e-9);
});

test("length: round trip through a third unit", () => {
  const original = 42;
  const roundTripped = convert(convert(original, "ft", "cm"), "cm", "ft");
  assert.ok(Math.abs(roundTripped - original) < 1e-9);
});

test("mass: lb to kg", () => {
  assert.ok(Math.abs(convert(1, "lb", "kg") - 0.45359237) < 1e-12);
});

test("mass: oz to g", () => {
  assert.ok(Math.abs(convert(16, "oz", "g") - 453.59237) < 1e-9);
});

test("time: h to s", () => {
  assert.equal(convert(1, "h", "s"), 3600);
});

test("time: day to min", () => {
  assert.equal(convert(1, "day", "min"), 1440);
});

test("temperature: C to F", () => {
  assert.ok(Math.abs(convert(100, "C", "F") - 212) < 1e-9);
});

test("temperature: F to C", () => {
  assert.ok(Math.abs(convert(32, "F", "C") - 0) < 1e-9);
});

test("temperature: C to K", () => {
  assert.ok(Math.abs(convert(0, "C", "K") - 273.15) < 1e-9);
});

test("same unit is a no-op", () => {
  assert.equal(convert(7, "kg", "kg"), 7);
});

test("dimension mismatch throws", () => {
  assert.throws(() => convert(1, "km", "kg"), DimensionMismatchError);
});

test("unknown source unit throws", () => {
  assert.throws(() => convert(1, "furlong", "m"), UnknownUnitError);
});

test("unknown target unit throws", () => {
  assert.throws(() => convert(1, "m", "furlong"), UnknownUnitError);
});

test("temperature below absolute zero throws", () => {
  assert.throws(() => convert(-300, "C", "F"), BelowAbsoluteZeroError);
  assert.throws(() => convert(-500, "F", "C"), BelowAbsoluteZeroError);
  assert.throws(() => convert(-1, "K", "C"), BelowAbsoluteZeroError);
});

test("exactly absolute zero is allowed", () => {
  assert.ok(Math.abs(convert(-273.15, "C", "K") - 0) < 1e-9);
  assert.ok(Math.abs(convert(0, "K", "F") - -459.67) < 1e-9);
});
