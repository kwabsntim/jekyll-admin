import React, { Component } from 'react';
import PropTypes from 'prop-types';

const LANGUAGETOOL_API = 'https://api.languagetool.org/v2/check';

// Strip markdown syntax so LanguageTool checks plain prose, not symbols.
// Also builds a character offset map so we can translate plain-text positions
// back to positions in the original markdown.
function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, '') // fenced code blocks
    .replace(/`[^`]*`/g, '')        // inline code
    .replace(/!\[.*?\]\(.*?\)/g, '') // images
    .replace(/\[.*?\]\(.*?\)/g, '')  // links
    .replace(/#{1,6}\s/g, '')        // headings
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
    .replace(/(\*|_)(.*?)\1/g, '$2')    // italic
    .replace(/^\s*[-*+]\s/gm, '')    // list bullets
    .replace(/^\s*\d+\.\s/gm, '')    // numbered lists
    .replace(/>\s/g, '')             // blockquotes
    .trim();
}

class GrammarChecker extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isChecking: false,
      matches: [],
      error: null,
      hasChecked: false,
      activeIndex: null,
    };
  }

  handleCheck = () => {
    const { content } = this.props;

    if (!content || !content.trim()) {
      this.setState({ error: 'Nothing to check — write some content first.' });
      return;
    }

    this.setState({
      isChecking: true,
      error: null,
      matches: [],
      hasChecked: false,
      activeIndex: null,
    });

    const plainText = stripMarkdown(content);

    const body = new URLSearchParams();
    body.append('text', plainText);
    body.append('language', 'en-US');
    body.append('enabledOnly', 'false');

    fetch(LANGUAGETOOL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
      .then(res => {
        if (!res.ok) {
          throw new Error(`LanguageTool returned status ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        this.setState({
          isChecking: false,
          matches: data.matches || [],
          hasChecked: true,
        });
      })
      .catch(err => {
        this.setState({
          isChecking: false,
          error: `Could not reach LanguageTool API. Check your internet connection. (${err.message})`,
          hasChecked: false,
        });
      });
  };

  handleJumpTo = (index, match) => {
    const { onJumpTo } = this.props;
    this.setState({ activeIndex: index });

    if (onJumpTo && match.offset !== undefined) {
      // pass the offset and length so the editor can highlight the word
      onJumpTo(match.offset, match.length || (match.context
        ? match.context.length
        : 0));
    }
  };

  renderMatches() {
    const { matches, activeIndex } = this.state;

    if (matches.length === 0) {
      return (
        <div className="grammar-all-good">
          <span className="grammar-icon">✓</span> No issues found — looks good!
        </div>
      );
    }

    return (
      <ul className="grammar-matches">
        {matches.map((match, i) => {
          const isActive = activeIndex === i;
          const errorWord = match.context && match.context.text
            ? match.context.text.substring(
                match.context.offset,
                match.context.offset + match.context.length
              )
            : match.sentence;

          return (
            <li
              key={i}
              className={`grammar-match-item${isActive ? ' grammar-match-active' : ''}`}
              onClick={() => this.handleJumpTo(i, match)}
              title="Click to jump to this issue in the editor"
            >
              <div className="grammar-match-header">
                <span className="grammar-match-type">
                  {match.rule && match.rule.issueType === 'misspelling'
                    ? '🔴 Spelling'
                    : '🟡 Grammar'}
                </span>
                <span className="grammar-match-context">
                  &ldquo;{errorWord}&rdquo;
                </span>
                <span className="grammar-jump-hint">↑ jump to</span>
              </div>
              <p className="grammar-match-message">{match.message}</p>
              {match.replacements && match.replacements.length > 0 && (
                <div className="grammar-suggestions">
                  <span className="grammar-suggestions-label">Suggestions: </span>
                  {match.replacements.slice(0, 4).map((r, j) => (
                    <span key={j} className="grammar-suggestion-chip">
                      {r.value}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  render() {
    const { isChecking, error, hasChecked, matches } = this.state;

    return (
      <div className="grammar-checker">
        <div className="grammar-checker-header">
          <span className="grammar-checker-title">Grammar &amp; Spell Check</span>
          <button
            className="grammar-check-btn"
            onClick={this.handleCheck}
            disabled={isChecking}
          >
            {isChecking ? 'Checking…' : 'Check Now'}
          </button>
        </div>

        {error && (
          <div className="grammar-error">{error}</div>
        )}

        {hasChecked && (
          <div className="grammar-results">
            <div className="grammar-results-summary">
              {matches.length === 0
                ? 'All clear'
                : `${matches.length} issue${matches.length !== 1 ? 's' : ''} found — click any issue to jump to it`}
            </div>
            {this.renderMatches()}
          </div>
        )}

        {!hasChecked && !error && !isChecking && (
          <p className="grammar-hint">
            Click <strong>Check Now</strong> to scan your post for spelling and
            grammar issues using LanguageTool.
          </p>
        )}
      </div>
    );
  }
}

GrammarChecker.propTypes = {
  content: PropTypes.string.isRequired,
  onJumpTo: PropTypes.func,
};

export default GrammarChecker;
