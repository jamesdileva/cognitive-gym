import { describe, expect, it } from 'vitest';
import { frontMatterScore, isLikelyFrontMatter } from '@main/ingestion/frontMatter';

describe('isLikelyFrontMatter', () => {
  it('flags a publisher copyright block (the Knight Physics report)', () => {
    const block = [
      'Copyright © 2017 Pearson Education, Inc. All rights reserved.',
      'This publication is protected by Copyright, and permission should be',
      'obtained from the publisher prior to any prohibited reproduction. The',
      'revenue from the sales of this book supports its continued publication.',
      'ISBN-10: 0-13-405966-8. Printed in the United States of America.'
    ].join(' ');
    expect(isLikelyFrontMatter(block)).toBe(true);
  });

  it('does not flag real lesson content', () => {
    const lesson =
      'When a net external force acts on a body, the body accelerates in the ' +
      'direction of that force. The acceleration is proportional to the force ' +
      'and inversely proportional to the mass of the body. Consider a cart of ' +
      'mass 2 kg pushed across a frictionless track by a steady 4 N push.';
    expect(isLikelyFrontMatter(lesson)).toBe(false);
  });

  it('does not flag long content that mentions a few markers incidentally', () => {
    // 400 words, 3 distinct markers → density below the 2-per-100-words gate.
    const filler =
      'The experiment measured how the cart responded to the applied force. ';
    const long = filler.repeat(40) + ' Published by the physics department, the study ' +
      'noted revenue for the laboratory came from grants. The edition of the ' +
      'textbook used was the third printing, though the copyright page was ' +
      'not part of the measured experiment itself.';
    expect(isLikelyFrontMatter(long)).toBe(false);
  });

  it('returns false for empty or whitespace-only text', () => {
    expect(isLikelyFrontMatter('')).toBe(false);
    expect(isLikelyFrontMatter('   \n\t  ')).toBe(false);
  });

  it('requires at least three distinct markers', () => {
    expect(isLikelyFrontMatter('Copyright 2017 Pearson. All rights reserved.'))
      .toBe(false);
  });
});

describe('frontMatterScore', () => {
  it('counts distinct markers once each and reports word count', () => {
    const { hits, words } = frontMatterScore(
      'Copyright © 2020. Copyright again. All rights reserved.'
    );
    expect(hits).toBe(3); // copyright, ©, all rights reserved — copyright counted once
    expect(words).toBe(8);
  });
});
