import React, { Component } from 'react';
import RS from 'remotestoragejs';
import './RemoteStorage.css';
import RSWidget from 'remotestorage-widget';
import Flashcards from 'remotestorage-module-flashcards';

class RemoteStorage extends Component {
  constructor() {
    super();
    this.state = {
      'rs': undefined,
      'flashcards': undefined,
      'widget': undefined,
      'connected': false,
      'connecting': false
    };

    let remoteStorage = new RS({
      cache: true,
      requestTimeout: 90000,
      modules: [ Flashcards ]
    });

    remoteStorage.access.claim('flashcards', 'rw');

    remoteStorage.on('ready', () => {
      console.debug('RS ready');
    });

    this.state.rs = remoteStorage;
    this.state.widget = new RSWidget(remoteStorage, { autoCloseAfter: 1000 });
  }

  componentDidMount() {
    this.state.rs.on('not-connected', () => {
      console.debug('RS not-connected');
      this.setState({
        'connecting': false,
        'connected': false
      });
    });

    this.state.rs.on('connected', () => {
      console.debug('RS connected');
      this.setState({
        'connecting': false,
        'connected': true
      });
    });

    this.state.rs.on('disconnected', () => {
      console.debug('RS disconnected');
      this.setState({
        'connecting': false,
        'connected': false
      });
    });

    this.state.rs.on('connecting', () => {
      console.debug('RS connecting');
      this.setState({
        'connecting': true,
        'connected': false
      });
    });

    this.state.rs.on('authing', () => {
      console.debug('RS authing');
      this.setState({
        'connecting': true,
        'connected': false
      });
    });

    this.state.widget.attach('rs-widget-container');
  }

  render() {
    return (
      <div id="rs-widget-container"></div>
    );
  }
}

export default RemoteStorage;