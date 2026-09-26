import React, { Component } from 'react';
import PropTypes from 'prop-types';
import SimpleMDE from 'simplemde';
import hljs from '../utils/highlighter';
import FilePicker from './FilePicker';
import GrammarChecker from './GrammarChecker';
import { getExtensionFromPath } from '../utils/helpers';

const classNames = [
  'editor-toolbar',
  'CodeMirror',
  'editor-preview-side',
  'editor-statusbar',
];

// How often to autosave (ms)
const AUTOSAVE_INTERVAL = 30000; // 30 seconds
// Debounce delay after typing stops before autosaving (ms)
const AUTOSAVE_DEBOUNCE = 6000; // 3 seconds

// Build a unique localStorage key for this post.
// For existing posts, uses the file path so it's stable across sessions.
// For new posts (no path yet), generates a random ID stored in sessionStorage
// so each new-post tab gets its own autosave slot.
function autosaveKey(storageKey) {
  if (storageKey && storageKey !== 'new' && storageKey.length > 1) {
    return `jekyll_admin_autosave_${storageKey}`;
  }
  // New post — get or create a tab-scoped unique ID
  const sessionKey = 'jekyll_admin_new_post_id';
  let newPostId = sessionStorage.getItem(sessionKey);
  if (!newPostId) {
    newPostId = `new_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    sessionStorage.setItem(sessionKey, newPostId);
  }
  return `jekyll_admin_autosave_${newPostId}`;
}

class MarkdownEditor extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showGrammarChecker: false,
      autosaveStatus: null, // null | 'saved' | 'restored'
      showRestorePrompt: false,
      recoveredContent: null,
    };
    this._autosaveTimer = null;
    this._debounceTimer = null;
  }

  componentDidMount() {
    this.create();
    window.hljs = hljs;
    this.checkForRecovery();
    // Start the interval-based autosave (like MS Word)
    this._autosaveTimer = setInterval(this.doAutosave, AUTOSAVE_INTERVAL);
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      nextProps.initialValue !== this.props.initialValue ||
      nextState.showGrammarChecker !== this.state.showGrammarChecker ||
      nextState.autosaveStatus !== this.state.autosaveStatus ||
      nextState.showRestorePrompt !== this.state.showRestorePrompt
    );
  }

  componentDidUpdate(prevProps) {
    if (prevProps.initialValue !== this.props.initialValue) {
      this.destroy();
      this.create();
      this.checkForRecovery();
    }
  }

  componentWillUnmount() {
    this.destroy();
    clearInterval(this._autosaveTimer);
    clearTimeout(this._debounceTimer);
  }

  // Generate the storage key — use the post path if available, else page URL
  getStorageKey() {
    const { storageKey } = this.props;
    return autosaveKey(storageKey || window.location.pathname);
  }

  // Check localStorage for a recovery on mount
  checkForRecovery() {
    try {
      const saved = localStorage.getItem(this.getStorageKey());
      if (!saved) return;

      const { content, savedAt } = JSON.parse(saved);
      const currentContent = this.props.initialValue || '';

      // Only prompt if the saved content is different from what's on disk
      if (content && content !== currentContent) {
        this.setState({
          showRestorePrompt: true,
          recoveredContent: content,
          recoveredAt: savedAt,
        });
      }
    } catch (e) {
      // ignore corrupted storage
    }
  }

  // Write current content to localStorage
  doAutosave = () => {
    if (!this.editor) return;
    const content = this.editor.value();
    if (!content || !content.trim()) return;

    try {
      localStorage.setItem(
        this.getStorageKey(),
        JSON.stringify({
          content,
          savedAt: new Date().toISOString(),
        })
      );
      this.setState({ autosaveStatus: 'saved' });
      // Fade the indicator out after 3 seconds
      setTimeout(() => this.setState({ autosaveStatus: null }), 3000);
    } catch (e) {
      // localStorage full or unavailable — fail silently
    }
  };

  // Clear the autosave from localStorage (called after a real save/publish)
  clearAutosave = () => {
    try {
      localStorage.removeItem(this.getStorageKey());
      // Also clear the new-post session ID so the next new post gets a fresh slot
      sessionStorage.removeItem('jekyll_admin_new_post_id');
    } catch (e) {
      // ignore
    }
  };

  handleRestoreYes = () => {
    const { recoveredContent } = this.state;
    if (this.editor && recoveredContent) {
      this.editor.value(recoveredContent);
      this.props.onChange(recoveredContent);
    }
    this.setState({
      showRestorePrompt: false,
      recoveredContent: null,
      autosaveStatus: 'restored',
    });
    setTimeout(() => this.setState({ autosaveStatus: null }), 4000);
  };

  handleRestoreNo = () => {
    this.clearAutosave();
    this.setState({ showRestorePrompt: false, recoveredContent: null });
  };

  toggleGrammarChecker = () => {
    this.setState(prev => ({ showGrammarChecker: !prev.showGrammarChecker }));
  };

  create() {
    const { onChange, onSave } = this.props;
    let opts = Object.create(this.props);
    opts['element'] = this.refs.text;
    opts['autoDownloadFontAwesome'] = false;
    opts['spellChecker'] = false;
    opts['renderingConfig'] = {
      codeSyntaxHighlighting: true,
    };
    opts['insertTexts'] = {
      image: ['![', '](#url#)'],
    };
    let toolbarIcons = [
      'bold',
      'italic',
      'heading',
      '|',
      'code',
      'quote',
      'unordered-list',
      'ordered-list',
      '|',
      'link',
      'image',
      'table',
      {
        name: 'filepicker',
        action: () => this.refs.filepicker.refs.trigger.click(),
        className: 'fa fa-paperclip',
        title: 'Insert Static File',
      },
      '|',
      'preview',
      'side-by-side',
      'fullscreen',
      '|',
      {
        name: 'grammarCheck',
        action: () => this.toggleGrammarChecker(),
        className: 'fa fa-check-circle',
        title: 'Check Grammar & Spelling',
      },
    ];
    if (onSave) {
      toolbarIcons.push({
        name: 'save',
        action: () => {
          onSave();
          this.clearAutosave();
        },
        className: 'fa fa-floppy-o',
        title: 'Save',
      });
    }
    opts['toolbar'] = toolbarIcons;
    const editor = new SimpleMDE(opts);
    if (editor.codemirror) {
      editor.codemirror.on('change', () => {
        const value = editor.value();
        onChange(value);
        // Debounce autosave on keystroke — save 3s after typing stops
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(this.doAutosave, AUTOSAVE_DEBOUNCE);
      });
    }
    this.editor = editor;
  }

  destroy() {
    clearTimeout(this._debounceTimer);
    for (let i in classNames) {
      let elementToRemove = this.refs.container.querySelector(
        '.' + classNames[i]
      );
      elementToRemove && elementToRemove.remove();
    }
  }

  _replaceSelectedText = (cm, headNTail, url) => {
    const startPoint = cm.getCursor('start');
    const endPoint = cm.getCursor('end');
    const text = cm.getSelection();

    let [head, tail] = headNTail;
    if (url) {
      tail = tail.replace('#url#', url);
    }

    cm.replaceSelection(`${head}${text}${tail}`);
    startPoint.ch += head.length;

    if (startPoint !== endPoint) {
      endPoint.ch += head.length;
    }

    cm.setSelection(startPoint, endPoint);
    cm.focus();
  };

  handleFilePick = path => {
    const { codemirror, options } = this.editor;
    const { image, link } = options.insertTexts;
    const url = `{{ '${path}' | relative_url }}`;
    const ext = getExtensionFromPath(path);

    const type = /png|jpg|gif|jpeg|svg|ico/i.test(ext) ? image : link;
    this._replaceSelectedText(codemirror, type, url);
  };

  getCurrentContent() {
    return this.editor ? this.editor.value() : this.props.initialValue;
  }

  handleJumpTo = (offset, length) => {
    if (!this.editor || !this.editor.codemirror) return;

    const cm = this.editor.codemirror;
    const content = this.getCurrentContent();

    const plainText = content
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]*`/g, '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      .replace(/^\s*[-*+]\s/gm, '')
      .replace(/^\s*\d+\.\s/gm, '')
      .replace(/>\s/g, '')
      .trim();

    const errorWord = plainText.substring(offset, offset + length);
    if (!errorWord) return;

    const rawIndex = content.indexOf(errorWord);
    if (rawIndex === -1) return;

    const from = cm.posFromIndex(rawIndex);
    const to = cm.posFromIndex(rawIndex + errorWord.length);

    cm.setSelection(from, to);
    cm.scrollIntoView({ from, to }, 100);
    cm.focus();
  };

  renderRestorePrompt() {
    const { recoveredAt } = this.state;
    const timeStr = recoveredAt
      ? new Date(recoveredAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    return (
      <div className="autosave-restore-prompt">
        <span className="autosave-restore-icon">⚠️</span>
        <span className="autosave-restore-text">
          Unsaved content found from {timeStr}. Restore it?
        </span>
        <button className="autosave-restore-btn autosave-restore-yes" onClick={this.handleRestoreYes}>
          Restore
        </button>
        <button className="autosave-restore-btn autosave-restore-no" onClick={this.handleRestoreNo}>
          Discard
        </button>
      </div>
    );
  }

  renderAutosaveStatus() {
    const { autosaveStatus } = this.state;
    if (!autosaveStatus) return null;

    const messages = {
      saved: '✓ Autosaved',
      restored: '✓ Content restored',
    };

    return (
      <div className={`autosave-status autosave-status-${autosaveStatus}`}>
        {messages[autosaveStatus]}
      </div>
    );
  }

  render() {
    const { showGrammarChecker, showRestorePrompt } = this.state;

    return (
      <div>
        <div style={{ display: 'none' }}>
          <FilePicker ref="filepicker" onPick={this.handleFilePick} />
        </div>
        {showRestorePrompt && this.renderRestorePrompt()}
        <div ref="container">
          <textarea ref="text" />
        </div>
        {this.renderAutosaveStatus()}
        {showGrammarChecker && (
          <GrammarChecker
            content={this.getCurrentContent()}
            onJumpTo={this.handleJumpTo}
          />
        )}
      </div>
    );
  }
}

MarkdownEditor.propTypes = {
  initialValue: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  storageKey: PropTypes.string,
};

export default MarkdownEditor;
