"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    }
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) if (e.indexOf(p[i]) < 0)
            t[p[i]] = s[p[i]];
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = require("react");
var logo_svg_1 = require("./res/logo.svg");
require("./App.css");
var react_router_dom_1 = require("react-router-dom");
var CardList_1 = require("./components/CardList");
var CardEdit_1 = require("./components/CardEdit");
var ErrorBoundary_1 = require("./components/ErrorBoundary");
var remotestoragejs_1 = require("remotestoragejs");
var remotestorage_widget_1 = require("remotestorage-widget");
var remotestorage_module_flashcards_1 = require("remotestorage-module-flashcards");
require("./components/RemoteStorage.css");
var App = /** @class */ (function (_super) {
    __extends(App, _super);
    function App(props) {
        var _this = _super.call(this, props) || this;
        _this.saveCard = function (card) {
            _this.state.flashcards.store(card).then(function (card) {
                console.log('card saved ', card);
                var cards = _this.state.cards;
                cards[card['@id']] = card;
                _this.setState({ cards: cards });
            }).catch(function (err) {
                throw new Error(err);
            });
        };
        _this.getCard = function (id) {
            return _this.state.cards[id];
        };
        _this.getCards = function (group) {
            return _this.state.cards;
        };
        _this.state = {
            rs: undefined,
            flashcards: undefined,
            widget: undefined,
            connected: false,
            connecting: false,
            cards: {},
            loaded: false,
        };
        var remoteStorage = new remotestoragejs_1.default({
            cache: true,
            requestTimeout: 90000,
            modules: [remotestorage_module_flashcards_1.default]
        });
        remoteStorage.access.claim('flashcards', 'rw');
        remoteStorage.on('ready', function () {
        });
        _this.state.rs = remoteStorage;
        _this.state.widget = new remotestorage_widget_1.default(remoteStorage, { autoCloseAfter: 1000 });
        _this.state.flashcards = remoteStorage.flashcards;
        return _this;
    }
    // TODO: investigate componentDidUpdate
    App.prototype.componentDidMount = function () {
        var _this = this;
        this.state.flashcards.on('change', function (p1, p2) {
            console.log('flashcard.on(change) event fired: ');
            console.log(p1);
            console.log(p2);
        });
        // this.state.rs.on('change', (p1, p2) => {
        //   console.log('rs.on(change) event fired: ');
        //   console.log(p1);
        //   console.log(p2);
        // });
        this.state.rs.on('not-connected', function () {
            console.log('RS not-connected');
            _this.setState({
                connecting: false,
                connected: false
            });
            _this.state.flashcards.getAllByGroup().then(function (cards) {
                console.log('setting flashcards: ', cards);
                _this.setState({ cards: cards, loaded: true });
            });
        });
        this.state.rs.on('connected', function () {
            console.log('RS connected');
            _this.setState({
                connecting: false,
                connected: true
            });
            _this.state.flashcards.getAllByGroup().then(function (cards) {
                console.log('setting flashcards: ', cards);
                _this.setState({ cards: cards, loaded: true });
            });
        });
        this.state.rs.on('disconnected', function () {
            console.log('RS disconnected');
            _this.setState({
                rs: {
                    connecting: false,
                    connected: false
                }
            });
        });
        this.state.rs.on('connecting', function () {
            console.log('RS connecting');
            _this.setState({
                connecting: true,
                connected: false
            });
        });
        this.state.rs.on('authing', function () {
            console.log('RS authing');
            _this.setState({
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
    };
    App.prototype.render = function () {
        var renderMergedProps = function (component) {
            var rest = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                rest[_i - 1] = arguments[_i];
            }
            var finalProps = Object.assign.apply(Object, [{}].concat(rest));
            return (react_1.default.createElement(component, finalProps));
        };
        var PropsRoute = function (_a) {
            var component = _a.component, rest = __rest(_a, ["component"]);
            return __assign({}, rest);
            render = { routeProps: function () {
                    return renderMergedProps(component, routeProps, rest);
                } } /  >
            ;
        };
        ;
    };
    ;
    App.prototype.return = function (, div, className, ) {
        if (className === void 0) { className = "App" >
            to; }
    };
    return App;
}(react_1.Component));
 > src;
{
    logo_svg_1.default;
}
className = "App-logo";
alt = "logo" /  > /Link>
    < ErrorBoundary_1.default >
    id;
"rs-widget-container" > /div>
    < /ErrorBoundary>
    < /nav>
    < main;
className = "content" >
    {};
this.state.loaded ? Loading : ;
/div> :
    < react_router_dom_1.Switch >
    exact;
path = '/';
component = { CardList: CardList_1.default };
group = "default";
getCards = { getCards: getCards } /  >
    exact;
path = '/group/:group';
component = { CardList: CardList_1.default };
getCards = { getCards: getCards } /  >
    exact;
path = '/edit/:id';
component = { CardEdit: CardEdit_1.default };
getCard = { getCard: getCard };
saveCard = { saveCard: saveCard } /  >
    /Switch>;
/main>
    < /div>;
;
exports.default = App;
