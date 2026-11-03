import { describe, it, expect } from 'vitest';
import { speakify } from '../src/ui/atcRadio';

describe('ATC phraseology for speech', () => {
  it('headings, altitudes, flight levels, frequencies and runways', () => {
    expect(speakify('turn left heading 270, descend and maintain 3000')).toBe('turn left heading two seven zero, descend and maintain three thousand');
    expect(speakify('climb and maintain 2500')).toBe('climb and maintain two thousand five hundred');
    expect(speakify('maintain 11000')).toBe('maintain one one thousand');
    expect(speakify('climb FL120')).toBe('climb flight level one two zero');
    expect(speakify('contact approach 119.85')).toBe('contact approach one one niner decimal eight five');
    expect(speakify('cleared ILS runway 28R approach')).toBe('cleared I L S runway two eight right approach');
    expect(speakify('squawk 4512')).toBe('squawk four five one two');
  });
});
