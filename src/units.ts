export type Dimension = "length" | "mass" | "time" | "temperature";

interface LinearUnit {
  dimension: Dimension;
  // multiply a value in this unit by toBase to get the dimension's base unit
  toBase: number;
}

// Base units: meter, kilogram, second. Factors are exact conversion
// constants (SI definitions for imperial units), not measured values.
const LINEAR_UNITS: Record<string, LinearUnit> = {
  m: { dimension: "length", toBase: 1 },
  km: { dimension: "length", toBase: 1000 },
  cm: { dimension: "length", toBase: 0.01 },
  mm: { dimension: "length", toBase: 0.001 },
  mi: { dimension: "length", toBase: 1609.344 },
  yd: { dimension: "length", toBase: 0.9144 },
  ft: { dimension: "length", toBase: 0.3048 },
  in: { dimension: "length", toBase: 0.0254 },

  kg: { dimension: "mass", toBase: 1 },
  g: { dimension: "mass", toBase: 0.001 },
  mg: { dimension: "mass", toBase: 0.000001 },
  lb: { dimension: "mass", toBase: 0.45359237 },
  oz: { dimension: "mass", toBase: 0.028349523125 },

  s: { dimension: "time", toBase: 1 },
  ms: { dimension: "time", toBase: 0.001 },
  min: { dimension: "time", toBase: 60 },
  h: { dimension: "time", toBase: 3600 },
  day: { dimension: "time", toBase: 86400 },
};

// Temperature has an offset as well as a scale, so it can't share the
// linear toBase table above - it's handled through Kelvin instead.
const TEMPERATURE_UNITS = new Set(["C", "F", "K"]);

export class UnknownUnitError extends Error {
  constructor(unit: string) {
    super(`unknown unit: ${unit}`);
    this.name = "UnknownUnitError";
  }
}

export class DimensionMismatchError extends Error {
  constructor(from: string, fromDim: Dimension, to: string, toDim: Dimension) {
    super(`dimension mismatch: ${from} is ${fromDim}, ${to} is ${toDim}`);
    this.name = "DimensionMismatchError";
  }
}

export class BelowAbsoluteZeroError extends Error {
  constructor(value: number, unit: string) {
    super(`${value} ${unit} is below absolute zero`);
    this.name = "BelowAbsoluteZeroError";
  }
}

function dimensionOf(unit: string): Dimension {
  if (TEMPERATURE_UNITS.has(unit)) return "temperature";
  const entry = LINEAR_UNITS[unit];
  if (!entry) throw new UnknownUnitError(unit);
  return entry.dimension;
}

function toKelvin(value: number, unit: string): number {
  let kelvin: number;
  switch (unit) {
    case "K":
      kelvin = value;
      break;
    case "C":
      kelvin = value + 273.15;
      break;
    case "F":
      kelvin = ((value - 32) * 5) / 9 + 273.15;
      break;
    default:
      throw new UnknownUnitError(unit);
  }
  if (kelvin < 0) throw new BelowAbsoluteZeroError(value, unit);
  return kelvin;
}

function fromKelvin(value: number, unit: string): number {
  switch (unit) {
    case "K":
      return value;
    case "C":
      return value - 273.15;
    case "F":
      return ((value - 273.15) * 9) / 5 + 32;
    default:
      throw new UnknownUnitError(unit);
  }
}

export function convert(value: number, from: string, to: string): number {
  const fromDim = dimensionOf(from);
  const toDim = dimensionOf(to);
  if (fromDim !== toDim) {
    throw new DimensionMismatchError(from, fromDim, to, toDim);
  }

  if (fromDim === "temperature") {
    return fromKelvin(toKelvin(value, from), to);
  }

  const fromUnit = LINEAR_UNITS[from];
  const toUnit = LINEAR_UNITS[to];
  return (value * fromUnit.toBase) / toUnit.toBase;
}
