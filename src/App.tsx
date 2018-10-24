import * as React from 'react';
import iconLogo from './res/logo.svg';
import './App.css';
import { Switch, Route } from 'react-router-dom';
import ContentGrid, { GridType } from './components/ContentGrid';
import CardEdit from './components/cards/CardEdit';
import { CardProps } from "./components/cards/CardTile";
import { Link } from 'react-router-dom';
import RemoteStorage from 'remotestoragejs';
import RSWidget from 'remotestorage-widget';
import Flashcards from 'remotestorage-module-flashcards';

const remoteStorage = new RemoteStorage({
    cache: true,
    requestTimeout: 90000,
    modules: [ Flashcards ]
});

class App extends React.Component<any, any> {

    constructor(props: any) {
        super(props);

        remoteStorage.access.claim('flashcards', 'rw');

        this.state = {
            rs: remoteStorage,
            flashcards: remoteStorage.flashcards,
            widget: new RSWidget(remoteStorage, { autoCloseAfter: 1000 }),
            connected: remoteStorage.connected,
            cards: {},
            groups: {}
        };

        this.state.widget.attach('rs-widget-container');
    }

    // TODO: investigate componentDidUpdate
    componentDidMount() {
        console.debug('componentDidMount()');

        const connectionState = () => {
            this.setState({
                connected: remoteStorage.connected
            });
        };

        this.state.rs.on('connected', connectionState);
        this.state.rs.on('disconnected', connectionState);

        this.state.flashcards.listGroups().then((groupListing: Object) => {
            if (Object.keys(groupListing).length == 0 ) { return; }
            let grouped: any = {};
            let cards: any = {};

            Object.keys(groupListing).map((groupPath) => {
                return groupPath.replace(/\/$/, "");
            }).forEach((groupName) => {
                this.state.flashcards.getAllByGroup(groupName).then((groupedCards: Object) => {
                    console.log(`flashcards for ${groupName}: `, groupedCards);
                    grouped[groupName] = groupedCards;
                    cards = {...cards, ...groupedCards };
                    this.setState({
                        groups: grouped,
                        cards: cards
                    });
                });
            });
        });
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

        const getCards = (group: string): { string: CardProps } | {} => {
            let result = this.state.groups[group];
            if (! result) {
                return {};
            }
            return result;
        };

        const getGroups = (): { string: boolean } => {
            return this.state.groups;
        };

        return (
            <div className="App">
                <nav>
                    <div><Link to='/'><img src={iconLogo} className="logo" alt="logo"/></Link></div>
                </nav>
                <main className="content">
                    <Switch>
                        <PropsRoute exact path='/' component={ContentGrid} type={GridType.groups}
                                    getEntries={getGroups}/>
                        <PropsRoute exact path='/groups' component={ContentGrid} type={GridType.groups}
                                    getEntries={getGroups}/>
                        <PropsRoute exact path='/group/:group' type={GridType.cards} component={ContentGrid}
                                    getEntries={getCards}/>
                        <PropsRoute exact path='/edit/:id' component={CardEdit} getCard={getCard}
                                    saveCard={saveCard}/>
                    </Switch>
                </main>
            </div>
        );
    }
}

export default App;
