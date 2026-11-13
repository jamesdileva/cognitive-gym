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

  it('flags a long title/copyright block that the per-word density gate missed', () => {
    // Regression: chunkParagraphs can produce 1000+ word chunks mixing title
    // page, city list, copyright, and figure-description prose. Per-100-word
    // density mathematically cannot fire here; the sentence fraction must.
    const titlePage = 'This page intentionally left blank. Physics a strategic ' +
      'approach Third Edition Randall D. Knight California Polytechnic State ' +
      'University San Luis Obispo Boston Columbus Indianapolis New York San ' +
      'Francisco Upper Saddle River Amsterdam Cape Town Dubai London Madrid ' +
      'Munich Paris Montreal Toronto Delhi Mexico City Sao Paulo Sydney Hong ' +
      'Kong Seoul Singapore Taipei Tokyo.';
    const copyright = 'Copyright © 2017 Pearson Education, Inc. All rights ' +
      'reserved. This publication is protected by Copyright, and permission ' +
      'should be obtained from the publisher prior to any prohibited ' +
      'reproduction, storage in a retrieval system, or transmission in any ' +
      'form or by any means, electronic, mechanical, photocopying, recording, ' +
      'or likewise. For information regarding permissions, contact the ' +
      'appropriate Permissions Department. The revenue from the sales of ' +
      'this book supports its continued publication. ISBN-10: 0-13-405966-8. ' +
      'ISBN-13: 978-0-13-405966-1. Printed in the United States of America. ' +
      'Library of Congress Cataloging-in-Publication Data is available from ' +
      'the publisher on request. Visit www.pearsonhighered.com for details ' +
      'about this edition and the full catalog of titles.';
    const figureNote = 'The bars are of different heights, indicating the ' +
      'revenue for each year. The x-axis is labeled with the years from 2010 ' +
      'to 2015. The y-axis is labeled with the revenue in millions of ' +
      'dollars.'.repeat(3);
    const filler = 'Executive editor Dorothy J. Myers. Production supervision ' +
      'and page layout by Carly Bergey. Compositor and cover design work was ' +
      'provided by the production team over several months of effort, with ' +
      'proofreading passes by the copy editor and index preparation by the ' +
      'indexer for the publisher in Boston.';
    const bulk = (figureNote + ' ' + filler).repeat(12);
    const block = `${titlePage} ${copyright} ${bulk}`;
    expect(block.split(/\s+/).length).toBeGreaterThan(1000);
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
  it('counts marker sentences once each and distinct patterns', () => {
    const score = frontMatterScore(
      'Copyright © 2020 Pearson. All rights reserved. Copyright again in the ' +
      'next clause. The book covers mechanics thoroughly. Waves and optics ' +
      'appear in later chapters.'
    );
    expect(score.distinct).toBe(3); // copyright, ©, all rights reserved
    expect(score.markerSentences).toBe(3); // "Copyright © 2020 Pearson." / "All rights reserved." / "Copyright again…"
    expect(score.sentences).toBe(5);
  });
});
