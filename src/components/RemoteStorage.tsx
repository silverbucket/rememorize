import * as React from 'react';
import RS from 'remotestoragejs';
import './RemoteStorage.css';
import RSWidget from 'remotestorage-widget';
import Flashcards from 'remotestorage-module-flashcards';

class RemoteStorage extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
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
      console.log('RS ready');
    });

    this.state.rs = remoteStorage;
    this.state.widget = new RSWidget(remoteStorage, { autoCloseAfter: 1000 });
  }

  componentDidMount() {
    this.state.rs.on('not-connected', () => {
      console.log('RS not-connected');
      this.setState({
        'connecting': false,
        'connected': false
      });
    });

    this.state.rs.on('connected', () => {
      console.log('RS connected');
      this.setState({
        'connecting': false,
        'connected': true
      });
    });

    this.state.rs.on('disconnected', () => {
      console.log('RS disconnected');
      this.setState({
        'connecting': false,
        'connected': false
      });
    });

    this.state.rs.on('connecting', () => {
      console.log('RS connecting');
      this.setState({
        'connecting': true,
        'connected': false
      });
    });

    this.state.rs.on('authing', () => {
      console.log('RS authing');
      this.setState({
        'connecting': true,
        'connected': false
      });
    });

    this.state.widget.attach('rs-widget-container');
  }

  render() {
    return (
      <div id="rs-widget-container" />
    );
  }
}

export default RemoteStorage;