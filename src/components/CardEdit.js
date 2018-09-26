import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Header from './Header';
import './CardEdit.css';
import CardStaticInfo from './CardStaticInfo';

class CardEdit extends Component {
  render() {

    const onFormSubmit = (e) => {
      e.preventDefault();
      const _card = {
        '@id': e.target.elements.id.value,
        frontText: e.target.elements.frontText.value,
        backText: e.target.elements.backText.value,
        hint: e.target.elements.hint.value,
        group: e.target.elements.group.value
      };
      this.props.saveCard(_card);
    };

    const card = this.props.getCard(this.props.match.params.id);
    if (! card) { return null; }
    return (
      <div>
        <Header groupControls={false} title="Edit Card" />
        <div className="card-edit" key={card['@id']}>
          <form onSubmit={onFormSubmit}>
            <div className="card-info card-editable-info">
              <input type="hidden" name="id" defaultValue={card['@id']} readOnly />
              <div>
                <label htmlFor="front">front</label>
                <input type="text" name="frontText" className="card-front"
                  defaultValue={card.frontText} />
              </div>
              <div>
                <label htmlFor="back">back</label>
                <input type="text" name="backText" className="card-back" defaultValue={card.backText} />
              </div>
              <div>
                <label htmlFor="hint">hint</label>
                <input type="text" name="hint" className="card-hint" defaultValue={card.hint} />
              </div>
              <div>
                <label htmlFor="group">group</label>
                <input type="text" name="group" className="card-group"
                  defaultValue={card.group} />
              </div>
            </div>
            <CardStaticInfo card={card}></CardStaticInfo>
            <div className="controls">
              <button name="submit" value="save">Save</button>
              <button name="cancel" value="cancel">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    );
  }
}

CardEdit.propTypes = {
  match: PropTypes.object,
  getCard: PropTypes.func.isRequired,
  saveCard: PropTypes.func.isRequired
};

// {/* <div className="card-editable-info">
//   <div className="card-front-text">{card.frontText}</div>
//   <div className="card-back-text">{card.backText}</div>
//   <div className="card-hint card-info">hint: {card.hint}</div>
//   <div className="card-group card-info">group: {card.group}</div>
// </div>
// <div className="card-static-info">
//   <div className="card-familiarity">familiarity: {card.familiarity}</div>
//   <div className="card-familiarity">times reviewed: {card.reviewedCount}</div>
//   <div className="card-reviewed-at">last reviewed: {card.reviewedAt}</div>
//   <div className="card-updated-at">updated: {card.updatedAt}</div>
//   <div className="card-created-at">created: {card.createdAt}</div>
//   <div className="card-id">ID: {card['@id']}</div>
// </div> */}
export default CardEdit;