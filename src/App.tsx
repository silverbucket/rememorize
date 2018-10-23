import * as React from 'react';
import logo from './res/logo.svg';
import eye from './res/eye.svg';
import './App.css';
import { Switch, Route } from 'react-router-dom';
import Grid, { GridType } from './components/Grid';
import CardEdit from './components/cards/CardEdit';
import { CardProps } from "./components/cards/CardTile";
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
            groups: [],
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

            this.state.flashcards.listGroups().then((groups: Array<string> | object) => {
                console.log('got groups: ', groups);
                if (! Array.isArray(groups)) { groups = ['default']; }
                console.log('setting group list: ', groups);
                this.setState({groups: groups});
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
    }

    render() {
        const renderMergedProps = (component: any, ...rest: Array<any>): any => {
            const finalProps = Object.assign({}, ...rest);
            return (
                React.createElement(component, finalProps)
            );
        };

        const PropsRoute = ({component, ...rest}: any): any => {
            return (
                <Route {...rest} render={routeProps => {
                    return renderMergedProps(component, routeProps, rest);
                }}/>
            );
        };

        const saveCard = (card: CardProps): void => {
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

        const getCard = (id: string): CardProps => {
            return this.state.cards[id];
        };

        const getCards = (group: string): { string: CardProps } => {
            return this.state.cards;
        };

        const getGroups = (): Array<string> => {
            return this.state.groups;
        };

        return (
            <div className="App">
                <nav>
                    <div><Link to='/'><img src={logo} className="logo" alt="logo"/></Link></div>
                    <div><Link to='/'><img src={eye} className="review" alt="review"/></Link></div>
                    <ErrorBoundary>
                        <div id="rs-widget-container"/>
                    </ErrorBoundary>
                </nav>
                <main className="content">
                {!this.state.loaded ? <div>Loading...</div> :
                    <Switch>
                        <PropsRoute exact path='/' component={Grid} type={GridType.cards} group="default"
                                    getCards={getCards}/>
                        <PropsRoute exact path='/groups' component={Grid} type={GridType.groups}
                                    getGroups={getGroups}/>
                        <PropsRoute exact path='/group/:group' type={GridType.cards} component={Grid}
                                    getCards={getCards}/>
                        <PropsRoute exact path='/edit/:id' component={CardEdit} getCard={getCard}
                                    saveCard={saveCard}/>
                    </Switch>
                }
                </main>
            </div>
        );
    }
}

export default App;
