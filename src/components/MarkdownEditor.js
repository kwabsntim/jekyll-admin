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

class MarkdownEditor extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showGrammarChecker: false,
    };
  }

  componentDidMount() {
    this.create();
    window.hljs = hljs; // TODO: fix this after the next release of SimpleMDE
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      nextProps.initialValue !== this.props.initialValue ||
      nextState.showGrammarChecker !== this.state.showGrammarChecker
    );
  }

  componentDidUpdate(prevProps) {
    // only recreate the editor when initialValue changes, not on grammar panel toggle
    if (prevProps.initialValue !== this.props.initialValue) {
      this.destroy();
      this.create();
    }
  }

  componentWillUnmount() {
    this.destroy();
  }

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
        action: onSave,
        className: 'fa fa-floppy-o',
        title: 'Save',
      });
    }
    opts['toolbar'] = toolbarIcons;
    const editor = new SimpleMDE(opts);
    if (editor.codemirror) {
      editor.codemirror.on('change', () => {
        onChange(editor.value());
      });
    }
    this.editor = editor;
  }

  destroy() {
    for (let i in classNames) {
      let elementToRemove = this.refs.container.querySelector(
        '.' + classNames[i]
      );
      elementToRemove && elementToRemove.remove();
    }
  }

  // Adapted from an internal helper function within SimpleMDE package.
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

  // Jump CodeMirror cursor to the character offset LanguageTool reported,
  // then select the word so the user can see exactly what needs fixing.
  handleJumpTo = (offset, length) => {
    if (!this.editor || !this.editor.codemirror) return;

    const cm = this.editor.codemirror;
    const content = this.getCurrentContent();

    // Strip the same markdown we strip before sending to LanguageTool so the
    // offset lines up. We search for the plain-text word in the raw markdown.
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

    // Get the word at the offset in plain text
    const errorWord = plainText.substring(offset, offset + length);
    if (!errorWord) return;

    // Search for this word in the raw markdown content
    const rawIndex = content.indexOf(errorWord);
    if (rawIndex === -1) return;

    // Convert flat character index to CodeMirror {line, ch} position
    const from = cm.posFromIndex(rawIndex);
    const to = cm.posFromIndex(rawIndex + errorWord.length);

    // Move cursor, select the word, and scroll it into view
    cm.setSelection(from, to);
    cm.scrollIntoView({ from, to }, 100);
    cm.focus();
  };

  render() {
    const { showGrammarChecker } = this.state;

    return (
      <div>
        <div style={{ display: 'none' }}>
          <FilePicker ref="filepicker" onPick={this.handleFilePick} />
        </div>
        <div ref="container">
          <textarea ref="text" />
        </div>
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
};

export default MarkdownEditor;
