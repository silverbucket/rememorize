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
require("./CardTile.css");
var CardStaticInfo_1 = require("./CardStaticInfo");
var CardTile = /** @class */ (function (_super) {
    __extends(CardTile, _super);
    function CardTile() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    CardTile.prototype.render = function () {
        return to = {};
        {
            pathname: '/edit/' + this.props.card['@id'];
        }
    };
    return CardTile;
}(react_1.Component));
 >
    className;
"card-tile";
key = { this: .props.card['@id'] } >
    className;
"card-editable-info" >
    className;
"grouping" >
    className;
"card-front-text" > { this: .props.card.frontText } < /div>
    < div;
className = "card-back-text" > { this: .props.card.backText } < /div>
    < /div>
    < div;
className = "grouping" >
    className;
"card-hint card-info" > hint;
{
    this.props.card.hint;
}
/div>
    < div;
className = "card-group card-info" > group;
{
    this.props.card.group;
}
/div>
    < /div>
    < /div>
    < CardStaticInfo_1.default;
card = { this: .props.card } > /CardStaticInfo>
    < /div>
    < /Link>;
;
exports.cardProps = {
    '@id': prop_types_1.default.string.isRequired,
    'frontText': prop_types_1.default.string.isRequired,
    'backText': prop_types_1.default.string.isRequired,
    'familiarity': prop_types_1.default.number.isRequired,
    'createdAt': prop_types_1.default.string.isRequired
};
CardTile.propTypes = {
    card: prop_types_1.default.shape(exports.cardProps)
};
exports.default = CardTile;
