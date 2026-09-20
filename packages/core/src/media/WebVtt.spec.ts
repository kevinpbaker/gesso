import { describe, expect, it } from 'vitest';

import { cueAt, parseWebVtt } from './WebVtt';

/**
 * The caption parser.
 *
 * Written against the shapes files actually have rather than against
 * the grammar: an identifier above the timings or not, both timestamp
 * spellings, settings that must not be swallowed into the end time,
 * markup that has to come out, and a malformed cue in the middle of
 * good ones — which is the case the whole no-throwing rule exists for.
 */

const SIMPLE = `WEBVTT

00:00.000 --> 00:02.000
Hello.

00:02.000 --> 00:04.500
And again.
`;

describe('parseWebVtt', () => {
  it('reads cues and their times', () => {
    const track = parseWebVtt(SIMPLE);
    expect(track.cues).toHaveLength(2);
    expect(track.cues[0]).toMatchObject({ start: 0, end: 2, text: 'Hello.' });
    expect(track.cues[1]).toMatchObject({ start: 2, end: 4.5, text: 'And again.' });
    expect(track.skipped).toBe(0);
  });

  it('reads the hours spelling as well as the minutes one', () => {
    const track = parseWebVtt('WEBVTT\n\n01:00:01.250 --> 01:00:02.000\nLate.\n');
    expect(track.cues[0]?.start).toBe(3601.25);
  });

  it('reads one and two digit fractions as tenths and hundredths', () => {
    // `00:01.5` is a second and a half, not a second and five
    // thousandths, and reading it the other way puts a caption up
    // 1.495 seconds early.
    const track = parseWebVtt('WEBVTT\n\n00:01.5 --> 00:02.25\nQuick.\n');
    expect(track.cues[0]?.start).toBe(1.5);
    expect(track.cues[0]?.end).toBe(2.25);
  });

  it('keeps an identifier written above the timings', () => {
    const track = parseWebVtt('WEBVTT\n\nintro\n00:00.000 --> 00:01.000\nHi.\n');
    expect(track.cues[0]?.id).toBe('intro');
    expect(track.cues[0]?.text).toBe('Hi.');
  });

  it('does not swallow cue settings into the end timestamp', () => {
    const track = parseWebVtt('WEBVTT\n\n00:00.000 --> 00:01.000 line:90% align:center\nLow.\n');
    expect(track.cues[0]?.end).toBe(1);
    expect(track.cues[0]?.settings).toEqual({ line: '90%', align: 'center' });
  });

  it('strips markup down to the words', () => {
    const track = parseWebVtt('WEBVTT\n\n00:00.000 --> 00:01.000\n<v Ann>It is <i>very</i> late &amp; cold.\n');
    // A caption that showed its own angle brackets would be worse than
    // one that lost its italics.
    expect(track.cues[0]?.text).toBe('It is very late & cold.');
  });

  it('keeps the line breaks inside a cue', () => {
    const track = parseWebVtt('WEBVTT\n\n00:00.000 --> 00:01.000\nFirst line\nsecond line\n');
    expect(track.cues[0]?.text).toBe('First line\nsecond line');
  });

  it('skips NOTE, STYLE and REGION blocks without counting them as damage', () => {
    const track = parseWebVtt(
      'WEBVTT\n\nNOTE this is a comment\nover two lines\n\nSTYLE\n::cue { color: red }\n\n00:00.000 --> 00:01.000\nHi.\n'
    );
    expect(track.cues).toHaveLength(1);
    expect(track.skipped).toBe(0);
  });

  it('skips a malformed cue and keeps the good ones', () => {
    const track = parseWebVtt(
      'WEBVTT\n\n00:00.000 --> 00:01.000\nGood.\n\nnot a timing line at all\n\n' +
        '00:02.000 --> 00:03.000\nAlso good.\n'
    );
    // A caption track is content, usually someone else's, and one bad
    // cue in a hundred is not a reason to show none of them.
    expect(track.cues.map(cue => cue.text)).toEqual(['Good.', 'Also good.']);
    expect(track.skipped).toBe(1);
  });

  it('refuses a cue that ends before it starts', () => {
    const track = parseWebVtt('WEBVTT\n\n00:05.000 --> 00:01.000\nBackwards.\n');
    expect(track.cues).toHaveLength(0);
    expect(track.skipped).toBe(1);
  });

  it('sorts cues that were written out of order', () => {
    const track = parseWebVtt('WEBVTT\n\n00:05.000 --> 00:06.000\nLater.\n\n00:01.000 --> 00:02.000\nEarlier.\n');
    expect(track.cues.map(cue => cue.text)).toEqual(['Earlier.', 'Later.']);
  });

  it('takes a header off the magic line', () => {
    expect(parseWebVtt('WEBVTT - Some title\n\n').header).toBe('- Some title');
  });

  it('survives a byte order mark in front of the magic word', () => {
    expect(parseWebVtt('﻿WEBVTT\n\n00:00.000 --> 00:01.000\nHi.\n').cues).toHaveLength(1);
  });

  it('answers nothing at all for a file that is not WebVTT', () => {
    expect(parseWebVtt('1\n00:00:00,000 --> 00:00:01,000\nAn SRT file.\n').cues).toEqual([]);
  });

  it('does not spin on a file that ends mid-block', () => {
    expect(parseWebVtt('WEBVTT\n\n00:00.000 --> 00:01.000').cues).toEqual([]);
  });
});

describe('cueAt', () => {
  const cues = parseWebVtt(SIMPLE).cues;

  it('finds the cue covering a position', () => {
    expect(cueAt(cues, 1).cue?.text).toBe('Hello.');
    expect(cueAt(cues, 3).cue?.text).toBe('And again.');
  });

  it('answers nothing between and after the cues', () => {
    const gapped = parseWebVtt('WEBVTT\n\n00:00.000 --> 00:01.000\nA\n\n00:02.000 --> 00:03.000\nB\n').cues;
    expect(cueAt(gapped, 1.5).cue).toBeNull();
    expect(cueAt(gapped, 99).cue).toBeNull();
  });

  it('treats the end of a cue as past it', () => {
    // Exactly on the boundary belongs to the next cue, not to both.
    expect(cueAt(cues, 2).cue?.text).toBe('And again.');
  });

  it('walks back when the position went backwards', () => {
    // A seek or a loop hands it a hint from further on than the answer.
    expect(cueAt(cues, 0.5, 1).cue?.text).toBe('Hello.');
  });

  it('returns a hint that makes the next lookup cheap', () => {
    const first = cueAt(cues, 1);
    expect(first.index).toBe(0);
    expect(cueAt(cues, 3, first.index).cue?.text).toBe('And again.');
  });

  it('shows the newest of two cues spoken over each other', () => {
    const overlapping = parseWebVtt(
      'WEBVTT\n\n00:00.000 --> 00:04.000\nFirst speaker\n\n00:01.000 --> 00:03.000\nInterrupting\n'
    ).cues;
    expect(cueAt(overlapping, 2).cue?.text).toBe('Interrupting');
    // And back to the one still running once the interruption ends.
    expect(cueAt(overlapping, 3.5).cue?.text).toBe('First speaker');
  });

  it('answers nothing for an empty track', () => {
    expect(cueAt([], 1).cue).toBeNull();
  });
});
