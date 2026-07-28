import { describe, expect, it } from 'vitest';
import {
  formatRetailDesignTypeLabel,
  normalizeRetailDesignTypeCode,
  PROJECT_DISCIPLINE_HEX,
  resolveDisciplineBlockClass,
  resolveRetailDesignTypeBlockClass,
  resolveTaskBlockColorClass,
  RETAIL_DESIGN_TYPE_HEX,
} from './design-type-colors';

describe('design-type-colors', () => {
  it('normalizes codes and labels', () => {
    expect(normalizeRetailDesignTypeCode('ESTIMATION_PURPOSE')).toBe('ESTIMATION_PURPOSE');
    expect(normalizeRetailDesignTypeCode('Estimation Purpose')).toBe('ESTIMATION_PURPOSE');
    expect(normalizeRetailDesignTypeCode('Client Submission')).toBe('CLIENT_SUBMISSION');
    expect(normalizeRetailDesignTypeCode('Technical Drawing')).toBe('TECHNICAL_DRAWING');
    expect(normalizeRetailDesignTypeCode('Retail')).toBeNull();
    expect(normalizeRetailDesignTypeCode('PROJECT')).toBeNull();
  });

  it('keeps retail hues clearly separated', () => {
    expect(RETAIL_DESIGN_TYPE_HEX.ESTIMATION_PURPOSE).toBe('#D946EF');
    expect(RETAIL_DESIGN_TYPE_HEX.PRESENTATION).toBe('#3B82F6');
    expect(RETAIL_DESIGN_TYPE_HEX.CLIENT_SUBMISSION).toBe('#06B6D4');
    expect(RETAIL_DESIGN_TYPE_HEX.TECHNICAL_DRAWING).toBe('#22A06B');

    expect(resolveRetailDesignTypeBlockClass('Estimation Purpose')).toContain('border-[#D946EF]');
    expect(resolveRetailDesignTypeBlockClass('Presentation')).toContain('border-[#3B82F6]');
    expect(resolveRetailDesignTypeBlockClass('Client Submission')).toContain('border-[#06B6D4]');
    expect(resolveRetailDesignTypeBlockClass('Technical Drawing')).toContain('border-[#22A06B]');
  });

  it('keeps project hues clearly separated from retail overlaps', () => {
    expect(PROJECT_DISCIPLINE_HEX.ARTWORK).toBe('#CDB83C');
    expect(PROJECT_DISCIPLINE_HEX.TECHNICAL).toBe('#F97316');
    expect(PROJECT_DISCIPLINE_HEX.LOCATION).toBe('#F43F5E');
    expect(PROJECT_DISCIPLINE_HEX.AS_BUILT).toBe('#4B5563');

    expect(resolveDisciplineBlockClass('Artwork')).toContain('border-[#CDB83C]');
    expect(resolveDisciplineBlockClass('Technical')).toContain('border-[#F97316]');
    expect(resolveDisciplineBlockClass('Location')).toContain('border-[#F43F5E]');
    expect(resolveDisciplineBlockClass('As-Built')).toContain('border-[#4B5563]');
  });

  it('prefers retail type, then discipline, then fallback', () => {
    expect(resolveTaskBlockColorClass('PROJECT', 'bg-blue-100')).toBe('bg-blue-100');
    expect(resolveTaskBlockColorClass('PROJECT', 'bg-blue-100', 'Technical')).toContain('#F97316');
    expect(formatRetailDesignTypeLabel('PRESENTATION')).toBe('Presentation');
  });
});
