import React, { Component } from 'react';
import logo from './res/logo.svg';
import './App.css';
import { Switch, Route } from 'react-router-dom';
import CardList from './components/CardList';
import CardEdit from './components/CardEdit';
import { Link } from 'react-router-dom';
import RemoteStorage from './components/RemoteStorage';
import ErrorBoundary from './components/ErrorBoundary';

class App extends Component {

  constructor(props) {
    super(props);

    this.state = {
      cards: [],
      loaded: false
    }
  }

  // TODO: investigate componentDidUpdate

  componentDidMount() {
    console.log('TODO: fetch from remotestorage...');
    this.setState({ cards: [
      {
        '@id': '20180283020323',
        '@type': 'flashcard',
        'frontText': 'pivo',
        'backText': 'beer',
        'hint': 'magical drink',
        'familiarity': 3,
        'group': 'food',
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
        'group': 'food',
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
        'group': 'verbs',
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
        'group': 'food',
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
    ]});
    this.setState({loaded: true})
  }

  render() {
    const renderMergedProps = (component, ...rest) => {
      const finalProps = Object.assign({}, ...rest);
      return (
        React.createElement(component, finalProps)
      );
    };

    const PropsRoute = ({ component, ...rest }) => {
      return (
        <Route {...rest} render={routeProps => {
          return renderMergedProps(component, routeProps, rest);
        }}/>
      );
    };

    const saveCard = (card) => {
      if (! card['@id']) {
        // create new card
        console.log(`saveCard(...new...)`, card);
      } else {
        let cards = this.state.cards;
        // update card
        console.log(`saveCard(${card['@id']})`, card);
        for (let [i, v] of cards.entries()) {
          if (v['@id'] === card['@id']) {
            cards[i].frontText = card.frontText;
            cards[i].backText = card.backText;
            cards[i].hint = card.hint;
            cards[i].group = card.group;
            this.setState({cards: cards});
          }
        }
      }
      return undefined;
    };

    const getCard = (id) => {
      console.log(`getCard(${id})`);
      for (let card of this.state.cards) {
        if (card['@id'] === id) { return card; }
      }
      return null;
    };

    const getCardList = (group) => {
      let list = [];
      for (let card of this.state.cards) {
        if (card['group'] === group) {
          list.push(card);
        } else {
        }
      }
      console.log(`result: `, list);
      return list;
    };

    return (
      <div className="App">
        <nav>
          <Link to='/'><img src={logo} className="App-logo" alt="logo" /></Link>
          <ErrorBoundary>
            <RemoteStorage />
          </ErrorBoundary>
        </nav>
        <main className="content">
          <Switch>
            <PropsRoute exact path='/' component={CardList} group="default"
                   getCardList={getCardList}/>
            <PropsRoute exact path='/group/:group' component={CardList}
                   getCardList={getCardList}/>
            <PropsRoute exact path='/edit/:id' component={CardEdit}
                        getCard={getCard} saveCard={saveCard} />
          </Switch>
        </main>
      </div>
    );
  }
}

export default App;
