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
require("./CardEdit.css");
var CardStaticInfo_1 = require("./CardStaticInfo");
var CardEdit = /** @class */ (function (_super) {
    __extends(CardEdit, _super);
    function CardEdit() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    CardEdit.prototype.render = function () {
        var _this = this;
        var card = {};
        if (this.props.match.params.id !== 'new') {
            card = this.props.getCard(this.props.match.params.id);
            if (!card) {
                return null;
            }
        }
        var onFormSubmit = function (e) {
            e.preventDefault();
            var _card = {
                '@id': card['@id'],
                frontText: e.target.elements.frontText.value,
                backText: e.target.elements.backText.value,
                hint: e.target.elements.hint.value,
                group: e.target.elements.group.value
            };
            _this.props.saveCard(_card);
        };
        return groupControls = { false:  };
        title = "Edit Card" /  >
            className;
        "card-edit";
        key = { card: ['@id'] } >
            onSubmit;
        {
            onFormSubmit;
        }
         >
            className;
        "card-info card-editable-info" >
            htmlFor;
        "frontText" > front < /label>
            < input;
        type = "text";
        name = "frontText";
        className = "card-front";
        defaultValue = { card: .frontText } /  >
            /div>
            < div >
            htmlFor;
        "backText" > back < /label>
            < input;
        type = "text";
        name = "backText";
        className = "card-back";
        defaultValue = { card: .backText } /  >
            /div>
            < div >
            htmlFor;
        "hint" > hint < /label>
            < input;
        type = "text";
        name = "hint";
        className = "card-hint";
        defaultValue = { card: .hint } /  >
            /div>
            < div >
            htmlFor;
        "group" > group < /label>
            < input;
        type = "text";
        name = "group";
        className = "card-group";
        defaultValue = { card: .group } /  >
            /div>
            < /div>
            < CardStaticInfo_1.default;
        card = { card: card } > /CardStaticInfo>
            < div;
        className = "controls" >
            name;
        "submit";
        value = "save" > Save < /button>
            < button;
        name = "cancel";
        value = "cancel" > Cancel < /button>
            < /div>
            < /form>
            < /div>
            < /div>;
        ;
    };
    return CardEdit;
}(react_1.Component));
CardEdit.propTypes = {
    match: prop_types_1.default.object,
    getCard: prop_types_1.default.func.isRequired,
    saveCard: prop_types_1.default.func.isRequired
};
exports.default = CardEdit;
