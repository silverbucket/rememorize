import * as React from 'react';
import logo from './res/logo.svg';
import './App.css';
import { Switch, Route } from 'react-router-dom';
import CardList from './components/CardList';
import CardEdit from './components/CardEdit';
import { CardProps } from "./components/CardTile";
import { Link } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import './components/RemoteStorage.css';
// @ts-ignore
import * as Redux from 'redux';
// @ts-ignore
import RS from 'remotestoragejs';
// @ts-ignore
import RSWidget from 'remotestorage-widget';
// @ts-ignore
import Flashcards from 'remotestorage-module-flashcards';


class App extends React.Component<any, any> {

  constructor(props: any) {
    super(props);

    this.state = {
      rs:  undefined,
      flashcards: undefined,
      widget: undefined,
      connected: false,
      connecting: false,
      cards: {},
      loaded: false,
    };

    let remoteStorage = new RS({
      cache: true,
      requestTimeout: 90000,
      modules: [ Flashcards ]
    });

    remoteStorage.access.claim('flashcards', 'rw');

    remoteStorage.on('ready', () => {
      console.log('rs ready');
    });

    // @ts-ignore
    this.state.rs = remoteStorage;
    // @ts-ignore
    this.state.widget = new RSWidget(remoteStorage, { autoCloseAfter: 1000 });
    // @ts-ignore
    this.state.flashcards = remoteStorage.flashcards;
  }

  // TODO: investigate componentDidUpdate

  componentDidMount() {
    console.log('this.state: ', this.state);
    // this.state.flashcards.on('change', (p1: any, p2: any) => {
    //   console.log('flashcard.on(change) event fired: ');
    //   console.log(p1);
    //   console.log(p2);
    // });

    // this.state.rs.on('change', (p1, p2) => {
    //   console.log('rs.on(change) event fired: ');
    //   console.log(p1);
    //   console.log(p2);
    // });

    this.state.rs.on('not-connected', () => {
      console.log('RS not-connected');
      this.setState({
        connecting: false,
        connected: false
      });
      this.state.flashcards.getAllByGroup().then((cards: Object) => {
        console.log('setting flashcards: ', cards);
        this.setState({cards: cards, loaded: true});
      });
    });

    this.state.rs.on('connected', () => {
      console.log('RS connected');
      this.setState({
        connecting: false,
        connected: true
      });
      this.state.flashcards.getAllByGroup().then((cards: Object) => {
        console.log('setting flashcards: ', cards);
        this.setState({cards: cards, loaded: true});
      });
    });

    this.state.rs.on('disconnected', () => {
      console.log('RS disconnected');
      this.setState({
        rs: {
          connecting: false,
          connected: false
        }
      });
    });

    this.state.rs.on('connecting', () => {
      console.log('RS connecting');
      this.setState({
        connecting: true,
        connected: false
      });
    });

    this.state.rs.on('authing', () => {
      console.log('RS authing');
      this.setState({
        connecting: true,
        connected: false
      });
    });

    this.state.widget.attach('rs-widget-container');

    // this.setState({ cards: [
    //   {
    //     '@id': '20180283020323',
    //     '@type': 'flashcard',
    //     'frontText': 'pivo',
    //     'backText': 'beer',
    //     'hint': 'magical drink',
    //     'familiarity': 3,
    //     'group': 'food',
    //     'reviewedCount': 4,
    //     'reviewedAt': '2018293920121',
    //     'updatedAt': '2018293920122',
    //     'createdAt': '2018293920123'
    //   },
    //   {
    //     '@id': '201702150639399',
    //     '@type': 'flashcard',
    //     'frontText': 'platys',
    //     'backText': 'flouder (fish)',
    //     'hint': '',
    //     'familiarity': 2,
    //     'group': 'food',
    //     'reviewedCount': 8,
    //     'reviewedAt': '2018293920181',
    //     'updatedAt': '2018293920182',
    //     'createdAt': '2018293920183'
    //   },
    //   {
    //     '@id': '20170215034119',
    //     '@type': 'flashcard',
    //     'frontText': 'nasel jsem to',
    //     'backText': 'i found it',
    //     'hint': '',
    //     'familiarity': 2,
    //     'group': 'default',
    //     'reviewedCount': 8,
    //     'reviewedAt': '2018293920181',
    //     'updatedAt': '2018293920182',
    //     'createdAt': '2018293920183'
    //   },
    //   {
    //     '@id': '20170215896759',
    //     '@type': 'flashcard',
    //     'frontText': 'beres',
    //     'backText': 'to take',
    //     'hint': '',
    //     'familiarity': 2,
    //     'group': 'verbs',
    //     'reviewedCount': 8,
    //     'reviewedAt': '2018293920181',
    //     'updatedAt': '2018293920182',
    //     'createdAt': '2018293920183'
    //   },
    //   {
    //     '@id': '20170245673479',
    //     '@type': 'flashcard',
    //     'frontText': 'nakladany hermelin',
    //     'backText': 'pickled cheese',
    //     'hint': '',
    //     'familiarity': 2,
    //     'group': 'food',
    //     'reviewedCount': 8,
    //     'reviewedAt': '2018293920181',
    //     'updatedAt': '2018293920182',
    //     'createdAt': '2018293920183'
    //   },
    //   {
    //     '@id': '20170dsf3431',
    //     '@type': 'flashcard',
    //     'frontText': 'pripominam me to',
    //     'backText': 'that reminds me',
    //     'hint': '',
    //     'familiarity': 2,
    //     'group': 'default',
    //     'reviewedCount': 8,
    //     'reviewedAt': '2018293920181',
    //     'updatedAt': '2018293920182',
    //     'createdAt': '2018293920183'
    //   },
    //   {
    //     '@id': '201725529',
    //     '@type': 'flashcard',
    //     'frontText': 'obvlaste',
    //     'backText': 'especially',
    //     'hint': '',
    //     'familiarity': 0,
    //     'group': 'default',
    //     'reviewedCount': 2,
    //     'reviewedAt': '2018293920151',
    //     'updatedAt': '2018293920152',
    //     'createdAt': '2018293920153'
    //   }
    // ]});
    //
  }

  render() {
    const renderMergedProps = (component: any, ...rest: Array<any>) => {
      const finalProps = Object.assign({}, ...rest);
      return (
        React.createElement(component, finalProps)
      );
    };

    const PropsRoute = ({component, ...rest}: any) => {
      return (
        <Route {...rest} render={routeProps => {
          return renderMergedProps(component, routeProps, rest);
        }}/>
      );
    };

    const saveCard = (card: CardProps) => {
      console.log("saving: ", card);
      this.state.flashcards.store(card).then((card: CardProps) => {
        console.log('card saved ', card);
        let cards = this.state.cards;
        cards[card['@id']] = card;
        this.setState({cards: cards})
      }).catch((err: any) => {
        throw new Error(err);
      });
    };

    const getCard = (id: string) => {
      return this.state.cards[id];
    };

    const getCards = (group: string) => {
      return this.state.cards;
    };

    return (
      <div className="App">
        <nav>
          <Link to='/'><img src={logo} className="App-logo" alt="logo" /></Link>
          <ErrorBoundary>
            <div id="rs-widget-container" />
          </ErrorBoundary>
        </nav>
        <main className="content">
          {! this.state.loaded ? <div>Loading...</div> :
            <Switch>
              <PropsRoute exact
                path='/' component={CardList} group="default" getCards={getCards}/>
              <PropsRoute exact path='/group/:group' component={CardList} getCards={getCards}/>
              <PropsRoute exact
                path='/edit/:id' component={CardEdit} getCard={getCard} saveCard={saveCard} />
            </Switch>
          }
        </main>
      </div>
    );
  }
}

export default App;
