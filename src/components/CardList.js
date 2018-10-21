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
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = require("react");
var prop_types_1 = require("prop-types");
require("./CardList.css");
var CardList = /** @class */ (function (_super) {
    __extends(CardList, _super);
    function CardList() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    CardList.prototype.render = function () {
        var cards = this.props.getCards(this.props.group);
        if (!cards) {
            return null;
        }
        return groupControls = { true:  };
        title = { this: .props.group } /  >
            {
                Object: .keys(cards).map(function (id) {
                    return key = { id: id };
                    card = { cards: [id] }
                        /  >
                    ;
                })
            };
    };
    return CardList;
}(react_1.Component));
/div>;
;
CardList.propTypes = {
    group: prop_types_1.default.string.isRequired,
    getCards: prop_types_1.default.func.isRequired
};
exports.default = CardList;
