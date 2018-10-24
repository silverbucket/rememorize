import * as React from 'react';
import { Redirect } from 'react-router-dom';
import Header from '../Header';
import './CardEdit.css';
import CardStaticInfo from './CardStaticInfo';
import { CardProps } from './CardTile';
import iconSave from './../../res/icon_save.svg';


export type CardEditProps = {
    saveCard(card: CardProps): void;
    getCard(id: string): CardProps;
    match: {
        params: {
            id: string
        }
    }
};

class CardEdit extends React.Component<CardEditProps, {}> {
    state = {
        redirect: false
    };

    render(): any {
        let card: CardProps = {
            '@id': '',
            frontText: '',
            backText: '',
            group: 'default'
        };

        console.log("this.props: ", this.props);
        if (this.props.match.params.id !== 'new') {
            card = this.props.getCard(this.props.match.params.id) as CardProps;
            if (! card) { return null; }
        }

        const onFormSubmit = (e: any) => {
            e.preventDefault();
            const _card: CardProps = {
                '@id': card['@id'],
                frontText: e.target.elements.frontText.value,
                backText: e.target.elements.backText.value,
                hint: e.target.elements.hint.value,
                group: e.target.elements.group.value
            };
            this.props.saveCard(_card);
            this.setState({ redirect: true });
        };

        console.log("-edit card: ", card);

        if (this.state.redirect) {
            const link = `/group/${card.group}`;
            return (
                <Redirect to={link} />
            )
        }

        return (
            <div>
                <Header groupControls={false} title="Edit Card" />
                <div className="card-edit" key={card['@id']}>
                    <form onSubmit={onFormSubmit}>
                        <div className="card-info card-editable-info">
                            <div className="card-editable-entry-wrapper">
                                <div className="label"><label htmlFor="frontText">front</label></div>
                                <div><input type="text" name="frontText" className="card-front" defaultValue={card.frontText} /></div>
                            </div>
                            <div className="card-editable-entry-wrapper">
                                <div className="label"><label htmlFor="backText">back</label></div>
                                <div><input type="text" name="backText" className="card-back" defaultValue={card.backText} /></div>
                            </div>
                            <div className="card-editable-entry-wrapper">
                                <div className="label"><label htmlFor="hint">hint</label></div>
                                <div><input type="text" name="hint" className="card-hint" defaultValue={card.hint} /></div>
                            </div>
                            <div className="card-editable-entry-wrapper">
                                <div className="label"><label htmlFor="group">group</label></div>
                                <div><input type="text" name="group" className="card-group" defaultValue={card.group} /></div>
                            </div>
                            </div>
                            <CardStaticInfo card={card} />
                            <div className="controls">
                                <button name="submit" value="save"><img src={iconSave} className="icon icon-save" alt="add"/></button>
                            </div>
                    </form>
                </div>
            </div>
        );
    }
}

export default CardEdit;