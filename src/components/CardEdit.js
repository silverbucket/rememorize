import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Header from './Header';
import './CardEdit.css';
import CardStaticInfo from './CardStaticInfo';

class CardEdit extends Component {
  render() {
    let card = {};
    if (this.props.match.params.id !== 'new') {
      card = this.props.getCard(this.props.match.params.id);
      if (! card) { return null; }
    }

    const onFormSubmit = (e) => {
      e.preventDefault();
      const _card = {
        '@id': card['@id'],
        frontText: e.target.elements.frontText.value,
        backText: e.target.elements.backText.value,
        hint: e.target.elements.hint.value,
        group: e.target.elements.group.value
      };
      this.props.saveCard(_card);
    };

    return (
      <div>
        <Header groupControls={false} title="Edit Card" />
        <div className="card-edit" key={card['@id']}>
          <form onSubmit={onFormSubmit}>
            <div className="card-info card-editable-info">
              <div>
                <label htmlFor="frontText">front</label>
                <input type="text" name="frontText" className="card-front"
                  defaultValue={card.frontText} />
              </div>
              <div>
                <label htmlFor="backText">back</label>
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

export default CardEdit;