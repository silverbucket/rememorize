import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';
import CardList from './components/CardList';
import RemoteStorage from './components/RemoteStorage';
import ErrorBoundary from './components/ErrorBoundary';

class App extends Component {
  componentWillMount() {
    console.log("TODO: fetch from remotestorage...");
  }

  getCardList() {
    return [
      {
        '@id': '20180283020323',
        '@type': 'flashcard',
        'frontText': 'pivo',
        'backText': 'beer',
        'hint': 'magical drink',
        'familiarity': 3,
        'group': 'default',
        'reviewedCount': 4,
        'reviewedAt': '2018293920121',
        'updatedAt': '2018293920122',
        'createdAt': '2018293920123'
      },
      {
        '@id': '201702150639399',
        '@type': 'flashcard',
        'frontText': 'platys',
        'backText': 'flouder (fish)',
        'hint': '',
        'familiarity': 2,
        'group': 'default',
        'reviewedCount': 8,
        'reviewedAt': '2018293920181',
        'updatedAt': '2018293920182',
        'createdAt': '2018293920183'
      },
      {
        '@id': '20170215034119',
        '@type': 'flashcard',
        'frontText': 'nasel jsem to',
        'backText': 'i found it',
        'hint': '',
        'familiarity': 2,
        'group': 'default',
        'reviewedCount': 8,
        'reviewedAt': '2018293920181',
        'updatedAt': '2018293920182',
        'createdAt': '2018293920183'
      },
      {
        '@id': '20170215896759',
        '@type': 'flashcard',
        'frontText': 'beres',
        'backText': 'to take',
        'hint': '',
        'familiarity': 2,
        'group': 'default',
        'reviewedCount': 8,
        'reviewedAt': '2018293920181',
        'updatedAt': '2018293920182',
        'createdAt': '2018293920183'
      },
      {
        '@id': '20170245673479',
        '@type': 'flashcard',
        'frontText': 'nakladany hermelin',
        'backText': 'pickled cheese',
        'hint': '',
        'familiarity': 2,
        'group': 'default',
        'reviewedCount': 8,
        'reviewedAt': '2018293920181',
        'updatedAt': '2018293920182',
        'createdAt': '2018293920183'
      },
      {
        '@id': '20170dsf3431',
        '@type': 'flashcard',
        'frontText': 'pripominam me to',
        'backText': 'that reminds me',
        'hint': '',
        'familiarity': 2,
        'group': 'default',
        'reviewedCount': 8,
        'reviewedAt': '2018293920181',
        'updatedAt': '2018293920182',
        'createdAt': '2018293920183'
      },
      {
        '@id': '201725529',
        '@type': 'flashcard',
        'frontText': 'obvlaste',
        'backText': 'especially',
        'hint': '',
        'familiarity': 0,
        'group': 'default',
        'reviewedCount': 2,
        'reviewedAt': '2018293920151',
        'updatedAt': '2018293920152',
        'createdAt': '2018293920153'

      }
    ];
  }

  render() {
    return (
      <div className="App">
        <nav className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <ErrorBoundary>
            <RemoteStorage />
          </ErrorBoundary>
        </nav>
        <main className="content">
          <ErrorBoundary>
            <CardList groupName="default" cardList={this.getCardList()} />
          </ErrorBoundary>
        </main>
      </div>
    );
  }
}

export default App;
