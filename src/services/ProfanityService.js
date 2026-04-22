/**
 * ProfanityService
 * Detects and filters profanity and inappropriate content in prayers
 * Uses word list matching and pattern analysis
 */

const { logger } = require('../utils/logger');

// Common inappropriate words list (can be extended)
const PROFANITY_WORDS = [
  'damn', 'hell', 'ass', 'bitch', 'bastard', 'crap', 'piss',
  'fuck', 'shit', 'dick', 'pussy', 'asshole', 'whore', 'slut',
  'motherfucker', 'dumbass', 'dipshit', 'fuckhead', 'bullshit'
];

// Patterns that suggest spam or inappropriate behavior
const SPAM_PATTERNS = [
  /(?:http|ftp|https):\/\/[\w-]+(\.[\w-]+)+[\w.,@?^=%&:\/~+#-]*[\w@?^=%&\/~+#-]?/gi, // URLs
  /[\s]*[A-Za-z0-9]+[A-Za-z0-9]*@[A-Za-z0-9]+\.[A-Za-z]{2,}[\s]*/gi, // Emails
  /(?:click|buy|visit|shop|order|now|limited|offer|deal|sale|promo|discount|code|coupon)(?:\s+here)?/gi, // Marketing
];

class ProfanityService {
  /**
   * Check content for profanity and inappropriate patterns
   * @param {string} content - The text to check
   * @returns {Promise<Object>} Detection results with matches and flags
   */
  static async checkProfanity(content) {
    try {
      const contentLower = content.toLowerCase();
      const matches = [];
      const flags = {
        hasProfanity: false,
        hasSpam: false,
        hasURLs: false,
        hasEmails: false,
        hasMarketing: false,
        inappropriateWordCount: 0,
      };

      // Check for profanity words
      for (const word of PROFANITY_WORDS) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        const wordMatches = contentLower.match(regex);
        if (wordMatches) {
          flags.hasProfanity = true;
          flags.inappropriateWordCount += wordMatches.length;
          matches.push({
            type: 'profanity',
            word: word,
            count: wordMatches.length,
          });
        }
      }

      // Check for spam patterns
      let urlMatches = [];
      let emailMatches = [];
      let marketingMatches = [];

      // URLs
      urlMatches = content.match(SPAM_PATTERNS[0]) || [];
      if (urlMatches.length > 0) {
        flags.hasURLs = true;
        flags.hasSpam = true;
      }

      // Emails
      emailMatches = content.match(SPAM_PATTERNS[1]) || [];
      if (emailMatches.length > 0) {
        flags.hasEmails = true;
        flags.hasSpam = true;
      }

      // Marketing language
      marketingMatches = content.match(SPAM_PATTERNS[2]) || [];
      if (marketingMatches.length > 0) {
        flags.hasMarketing = true;
        flags.hasSpam = true;
      }

      if (urlMatches.length > 0) {
        matches.push({
          type: 'spam_url',
          count: urlMatches.length,
          examples: urlMatches.slice(0, 2),
        });
      }

      if (emailMatches.length > 0) {
        matches.push({
          type: 'spam_email',
          count: emailMatches.length,
          examples: emailMatches.slice(0, 2),
        });
      }

      if (marketingMatches.length > 0) {
        matches.push({
          type: 'spam_marketing',
          count: marketingMatches.length,
          examples: marketingMatches.slice(0, 2),
        });
      }

      // Additional checks
      // Check for excessive caps (more than 50% caps)
      const capsCount = (content.match(/[A-Z]/g) || []).length;
      const capsRatio = content.length > 0 ? capsCount / content.length : 0;
      if (capsRatio > 0.5 && content.length > 10) {
        flags.hasExcessiveCaps = true;
        matches.push({
          type: 'excessive_caps',
          ratio: capsRatio.toFixed(2),
        });
      }

      // Check for repeated characters (e.g., "hellooooooo")
      const repeatedChars = /(.)\1{4,}/g.test(content);
      if (repeatedChars) {
        flags.hasRepeatedCharacters = true;
        matches.push({
          type: 'repeated_characters',
        });
      }

      return {
        success: true,
        matches,
        flags,
      };
    } catch (error) {
      logger.error('ProfanityService.checkProfanity error', {
        message: error.message,
        stack: error.stack,
      });

      throw error;
    }
  }

  /**
   * Calculate severity score (0-100) based on profanity results
   * @param {string} content - The original content
   * @param {Object} profanityResult - Result from checkProfanity
   * @returns {number} Severity score (0-100)
   */
  static getSeverityScore(content, profanityResult) {
    let score = 0;

    if (!profanityResult || !profanityResult.flags) {
      return score;
    }

    const flags = profanityResult.flags;
    const matches = profanityResult.matches || [];

    // Profanity: +25 for each word found, max 25
    if (flags.inappropriateWordCount > 0) {
      score += Math.min(25, flags.inappropriateWordCount * 5);
    }

    // Spam URLs: +20
    if (flags.hasURLs) {
      score += 20;
    }

    // Spam emails: +15
    if (flags.hasEmails) {
      score += 15;
    }

    // Marketing language: +10
    if (flags.hasMarketing) {
      score += 10;
    }

    // Excessive caps: +5
    if (flags.hasExcessiveCaps) {
      score += 5;
    }

    // Repeated characters: +5
    if (flags.hasRepeatedCharacters) {
      score += 5;
    }

    // Cap at 100
    return Math.min(100, score);
  }

  /**
   * Get recommendation based on profanity detection results
   * @param {Object} profanityResult - Result from checkProfanity
   * @param {number} severity - Severity score (0-100)
   * @returns {Object} Recommendation with action and reason
   */
  static getRecommendation(profanityResult, severity) {
    let action = 'APPROVE'; // Default: approve
    let reason = 'Content appears appropriate';
    let shouldFlag = false;
    let shouldReject = false;

    if (!profanityResult || !profanityResult.flags) {
      return { action, reason, shouldFlag, shouldReject };
    }

    const flags = profanityResult.flags;

    // Auto-reject if severe profanity or multiple spam indicators
    if (severity >= 70) {
      action = 'REJECT';
      shouldReject = true;
      reason = 'Content contains multiple policy violations (high severity: ' + severity + '/100)';
    }
    // Flag for manual review if moderate issues
    else if (severity >= 40) {
      action = 'FLAG';
      shouldFlag = true;
      reason = 'Content contains potential policy violations (moderate severity: ' + severity + '/100)';

      // Add specific reasons
      const issues = [];
      if (flags.hasProfanity) {
        issues.push(`${flags.inappropriateWordCount} inappropriate word(s)`);
      }
      if (flags.hasURLs) {
        issues.push('contains URL(s)');
      }
      if (flags.hasEmails) {
        issues.push('contains email(s)');
      }
      if (flags.hasMarketing) {
        issues.push('contains marketing language');
      }
      if (flags.hasExcessiveCaps) {
        issues.push('excessive capitalization');
      }

      if (issues.length > 0) {
        reason += ' - Issues: ' + issues.join(', ');
      }
    }
    // Auto-approve if low severity
    else if (severity < 10) {
      action = 'APPROVE';
      reason = 'Content appears appropriate (low severity: ' + severity + '/100)';
    }
    // Review if minor issues
    else {
      action = 'FLAG';
      shouldFlag = true;
      reason = 'Content has minor issues that warrant review (severity: ' + severity + '/100)';
    }

    return {
      action,
      reason,
      shouldFlag,
      shouldReject,
      severityScore: severity,
    };
  }

  /**
   * Filter/sanitize profanity in content
   * @param {string} content - The text to sanitize
   * @returns {string} Sanitized content with profanity replaced
   */
  static sanitize(content) {
    let sanitized = content;

    // Replace profanity words with asterisks
    for (const word of PROFANITY_WORDS) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const replacement = '*'.repeat(word.length);
      sanitized = sanitized.replace(regex, replacement);
    }

    return sanitized;
  }

  /**
   * Get content analysis metadata
   * @param {string} content - The text to analyze
   * @returns {Object} Metadata about the content
   */
  static getContentMetadata(content) {
    const words = content.trim().split(/\s+/);
    const chars = content.length;
    const lines = content.split('\n').length;
    const urls = (content.match(SPAM_PATTERNS[0]) || []).length;
    const emails = (content.match(SPAM_PATTERNS[1]) || []).length;

    return {
      wordCount: words.length,
      characterCount: chars,
      lineCount: lines,
      urlCount: urls,
      emailCount: emails,
      averageWordLength: words.length > 0 ? (chars / words.length).toFixed(2) : 0,
    };
  }
}

module.exports = ProfanityService;
