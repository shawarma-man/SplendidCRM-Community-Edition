/*
 * This program is free software: you can redistribute it and/or modify it under the terms of the 
 * GNU Affero General Public License as published by the Free Software Foundation, either version 3 
 * of the License, or (at your option) any later version.
 * 
 * In accordance with Section 7(b) of the GNU Affero General Public License version 3, 
 * the Appropriate Legal Notices must display the following words on all interactive user interfaces: 
 * "Copyright (C) 2005-2022 SplendidCRM Software, Inc. All rights reserved."
 */

// 1. React and fabric. 
import * as React from 'react';
import { RouteComponentProps, withRouter }        from 'react-router-dom'                         ;
import { observer }                               from 'mobx-react'                               ;
import { FontAwesomeIcon }                        from '@fortawesome/react-fontawesome'           ;
// 2. Store and Types. 
import { EditComponent }                          from '../../../types/EditComponent'             ;
import { HeaderButtons }                          from '../../../types/HeaderButtons'             ;
// 3. Scripts. 
import Sql                                        from '../../../scripts/Sql'                     ;
import L10n                                       from '../../../scripts/L10n'                    ;
import Security                                   from '../../../scripts/Security'                ;
import Credentials                                from '../../../scripts/Credentials'             ;
import SplendidCache                              from '../../../scripts/SplendidCache'           ;
import SplendidDynamic_EditView                   from '../../../scripts/SplendidDynamic_EditView';
import { Crm_Config }                             from '../../../scripts/Crm'                     ;
import { Admin_GetReactState }                    from '../../../scripts/Application'             ;
import { AuthenticatedMethod, LoginRedirect }     from '../../../scripts/Login'                   ;
import { EditView_LoadItem, EditView_LoadLayout } from '../../../scripts/EditView'                ;
import { UpdateModule }                           from '../../../scripts/ModuleUpdate'            ;
import { formatCurrency, formatNumber }           from '../../../scripts/Formatting'              ;
import { DiscountPrice, DiscountValue }           from '../../../scripts/OrderUtils'              ;
// 4. Components and Views. 
import ErrorComponent                             from '../../../components/ErrorComponent'       ;
import DumpSQL                                    from '../../../components/DumpSQL'              ;
import DynamicButtons                             from '../../../components/DynamicButtons'       ;
import HeaderButtonsFactory                       from '../../../ThemeComponents/HeaderButtonsFactory';

interface IAdminEditViewProps extends RouteComponentProps<any>
{
	MODULE_NAME       : string;
	ID                : string;
	LAYOUT_NAME?      : string;
	callback?         : any;
	rowDefaultSearch? : any;
	onLayoutLoaded?   : any;
	onSubmit?         : any;
	DuplicateID?      : string;
	// 04/10/2021 Paul.  Create framework to allow pre-compile of all modules. 
	isPrecompile?       : boolean;
	onComponentComplete?: (MODULE_NAME, RELATED_MODULE, LAYOUT_NAME, vwMain) => void;
}

interface IAdminEditViewState
{
	__total           : number;
	__sql             : string;
	item              : any;
	layout            : any;
	EDIT_NAME         : string;
	DUPLICATE         : boolean;
	LAST_DATE_MODIFIED: Date;
	SUB_TITLE         : any;
	editedItem        : any;
	dependents        : Record<string, Array<any>>;
	error?            : any;
	oNumberFormat     : any;
}

@observer
export default class ProductTemplatesEditView extends React.Component<IAdminEditViewProps, IAdminEditViewState>
{
	private _isMounted   : boolean = false;
	private refMap       : Record<string, React.RefObject<EditComponent<any, any>>>;
	private headerButtons = React.createRef<HeaderButtons>();
	private dynamicButtonsBottom = React.createRef<DynamicButtons>();

	public get data (): any
	{
		let row: any = {};
		// 08/27/2019 Paul.  Move build code to shared object. 
		let nInvalidFields: number = SplendidDynamic_EditView.BuildDataRow(row, this.refMap);
		if ( nInvalidFields == 0 )
		{
		}
		return row;
	}

	public validate(): boolean
	{
		// 08/27/2019 Paul.  Move build code to shared object. 
		let nInvalidFields: number = SplendidDynamic_EditView.Validate(this.refMap);
		return (nInvalidFields == 0);
	}

	public clear(): void
	{
		// 08/27/2019 Paul.  Move build code to shared object. 
		SplendidDynamic_EditView.Clear(this.refMap);
		if ( this._isMounted )
		{
			this.setState({ editedItem: {} });
		}
	}

	constructor(props: IAdminEditViewProps)
	{
		super(props);
		let EDIT_NAME = props.MODULE_NAME + '.EditView';
		if ( !Sql.IsEmptyString(props.LAYOUT_NAME) )
		{
			EDIT_NAME = props.LAYOUT_NAME;
		}
		let oNumberFormat = Security.NumberFormatInfo();
		this.state =
		{
			__total           : 0,
			__sql             : null,
			item              : (props.rowDefaultSearch ? props.rowDefaultSearch : null),
			layout            : null,
			EDIT_NAME         ,
			DUPLICATE         : false,
			LAST_DATE_MODIFIED: null,
			SUB_TITLE         : null,
			editedItem        : null,
			dependents        : {},
			error             : null,
			oNumberFormat     ,
		};
	}

	componentDidCatch(error, info)
	{
		console.error((new Date()).toISOString() + ' ' + this.constructor.name + '.componentDidCatch', error, info);
	}

	async componentDidMount()
	{
		const { MODULE_NAME } = this.props;
		this._isMounted = true;
		try
		{
			let status = await AuthenticatedMethod(this.props, this.constructor.name + '.componentDidMount');
			if ( status == 1 )
			{
				// 07/06/2020 Paul.  Admin_GetReactState will also generate an exception, but catch anyway. 
				if ( !(Security.IS_ADMIN() || SplendidCache.AdminUserAccess(MODULE_NAME, 'edit') >= 0) )
				{
					throw(L10n.Term('.LBL_INSUFFICIENT_ACCESS'));
				}
				// 10/27/2019 Paul.  In case of single page refresh, we need to make sure that the AdminMenu has been loaded. 
				if ( SplendidCache.AdminMenu == null )
				{
					await Admin_GetReactState(this.constructor.name + '.componentDidMount');
				}
				if ( !Credentials.ADMIN_MODE )
				{
					Credentials.SetADMIN_MODE(true);
				}
				await this.load();
			}
			else
			{
				LoginRedirect(this.props.history, this.constructor.name + '.componentDidMount');
			}
		}
		catch(error)
		{
			console.error((new Date()).toISOString() + ' ' + this.constructor.name + '.componentDidMount', error);
			this.setState({ error });
		}
	}

	async componentDidUpdate(prevProps: IAdminEditViewProps)
	{
		// 04/28/2019 Paul.  Include pathname in filter to prevent double-bounce when state changes. 
		if ( this.props.location.pathname != prevProps.location.pathname )
		{
			// 04/26/2019 Paul.  Bounce through ResetView so that layout gets completely reloaded. 
			// 11/20/2019 Paul.  Include search parameters. 
			this.props.history.push('/Reset' + this.props.location.pathname + this.props.location.search);
		}
		// 04/10/2021 Paul.  Create framework to allow pre-compile of all modules. 
		else
		{
			if ( this.props.onComponentComplete )
			{
				const { MODULE_NAME, ID } = this.props;
				const { item, layout, EDIT_NAME, error } = this.state;
				//console.log((new Date()).toISOString() + ' ' + this.constructor.name + '._onComponentComplete ' + EDIT_NAME, item);
				if ( layout != null && error == null )
				{
					if ( ID == null || item != null )
					{
						this.props.onComponentComplete(MODULE_NAME, null, EDIT_NAME, item);
					}
				}
			}
		}
	}

	componentWillUnmount()
	{
		this._isMounted = false;
	}
	
	private load = async () =>
	{
		const { MODULE_NAME, ID, rowDefaultSearch, DuplicateID } = this.props;
		const { EDIT_NAME } = this.state;
		try
		{
			const layout = EditView_LoadLayout(EDIT_NAME);
			// 06/19/2018 Paul.  Always clear the item when setting the layout. 
			// 06/19/2018 Paul.  Always clear the item when setting the layout. 
			if ( this._isMounted )
			{
				this.setState(
				{
					layout: layout,
					item: (rowDefaultSearch ? rowDefaultSearch : null),
					editedItem: null
				}, () =>
				{
					if ( this.props.onLayoutLoaded )
					{
						this.props.onLayoutLoaded();
					}
				});
				if ( !Sql.IsEmptyString(DuplicateID) )
				{
					await this.LoadItem(MODULE_NAME, DuplicateID);
				}
				else
				{
					await this.LoadItem(MODULE_NAME, ID);
				}
			}
		}
		catch(error)
		{
			console.error((new Date()).toISOString() + ' ' + this.constructor.name + '.load', error);
			this.setState({ error });
		}
	}

	private LoadItem = async (sMODULE_NAME: string, sID: string) =>
	{
		if ( !Sql.IsEmptyString(sID) )
		{
			try
			{
				// 11/19/2019 Paul.  Change to allow return of SQL. 
				const d = await EditView_LoadItem(sMODULE_NAME, sID, true);
				let item: any = d.results;
				let LAST_DATE_MODIFIED: Date = null;
				// 03/16/2014 Paul.  LAST_DATE_MODIFIED is needed for concurrency test. 
				if ( item != null && item['DATE_MODIFIED'] !== undefined )
				{
					LAST_DATE_MODIFIED = item['DATE_MODIFIED'];
				}
				if ( this._isMounted )
				{
					Sql.SetPageTitle(sMODULE_NAME, item, 'NAME');
					let SUB_TITLE: any = Sql.DataPrivacyErasedField(item, 'NAME');
					this.setState({ item, SUB_TITLE, __sql: d.__sql, LAST_DATE_MODIFIED });
				}
			}
			catch(error)
			{
				console.error((new Date()).toISOString() + ' ' + this.constructor.name + '.LoadItem', error);
				this.setState({ error });
			}
		}
	}

	private _onChange = (DATA_FIELD: string, DATA_VALUE: any, DISPLAY_FIELD?: string, DISPLAY_VALUE?: any): void =>
	{
		//console.log((new Date()).toISOString() + ' ' + this.constructor.name + '._onChange ' + DATA_FIELD, DATA_VALUE);
		let item = this.state.editedItem;
		if ( item == null )
			item = {};
		item[DATA_FIELD] = DATA_VALUE;
		if ( this._isMounted )
		{
			this.setState({ editedItem: item });
		}
	}

	private _createDependency = (DATA_FIELD: string, PARENT_FIELD: string, PROPERTY_NAME?: string): void =>
	{
		let { dependents } = this.state;
		if ( dependents[PARENT_FIELD] )
		{
			dependents[PARENT_FIELD].push( {DATA_FIELD, PROPERTY_NAME} );
		}
		else
		{
			dependents[PARENT_FIELD] = [ {DATA_FIELD, PROPERTY_NAME} ]
		}
		if ( this._isMounted )
		{
			this.setState({ dependents: dependents });
		}
	}

	private UpdateDependancy(DATA_FIELD: string, DATA_VALUE: any, PROPERTY_NAME?: string, item?: any)
	{
		let ref = this.refMap[DATA_FIELD];
		if ( ref && ref.current )
		{
			ref.current.updateDependancy(null, DATA_VALUE, PROPERTY_NAME, item);
		}
	}

	private UpdateDiscount = (PARENT_FIELD: string, DATA_VALUE: any) =>
	{
		const { oNumberFormat } = this.state;
		let item = this.state.editedItem;
		if ( item == null )
			item = {};
		item[PARENT_FIELD] = DATA_VALUE;
		// 02/21/2021 Paul.  Clear DISCOUNT_PRICE before calling UpdateDiscount() as it may be changed. 
		if ( PARENT_FIELD == 'PRICING_FORMULA' )
		{
			item['DISCOUNT_PRICE' ] = null;
			item['DISCOUNT_ID'    ] = '';
			this.UpdateDependancy('DISCOUNT_PRICE' , '' );
			this.UpdateDependancy('DISCOUNT_ID'    , '' );
		}
		//console.log((new Date()).toISOString() + ' ' + this.constructor.name + '.UpdateDiscount ' + PARENT_FIELD, DATA_VALUE);
		const currentItem = Object.assign({}, this.state.item, item);
		// 02/21/2021 Paul.  _onUpdate is called before the _onChange completes setState, so we need to correct the value. 
		let dCOST_PRICE     : number = Sql.ToDecimal(currentItem['COST_PRICE'     ]);
		let dLIST_PRICE     : number = Sql.ToDecimal(currentItem['LIST_PRICE'     ]);
		let dDISCOUNT_PRICE : number = Sql.ToDecimal(currentItem['DISCOUNT_PRICE' ]);
		let gDISCOUNT_ID    : string = Sql.ToString (currentItem['DISCOUNT_ID'    ]);
		let sPRICING_FORMULA: string = Sql.ToString (currentItem['PRICING_FORMULA']);
		// 02/21/2021 Paul.  Incorrect control name, was fPRICING_FACTOR. 
		let fPRICING_FACTOR : number = Sql.ToFloat  (currentItem['PRICING_FACTOR' ]);
		if ( !Sql.IsEmptyGuid(gDISCOUNT_ID) )
		{
			let rowDISCOUNT = SplendidCache.Discounts(gDISCOUNT_ID);
			if ( rowDISCOUNT != null )
			{
				sPRICING_FORMULA = Sql.ToString(rowDISCOUNT['PRICING_FORMULA']);
				fPRICING_FACTOR  = Sql.ToFloat (rowDISCOUNT['PRICING_FACTOR' ]);
				dDISCOUNT_PRICE = DiscountPrice(sPRICING_FORMULA, fPRICING_FACTOR, dCOST_PRICE, dLIST_PRICE, dDISCOUNT_PRICE);
				item['DISCOUNT_PRICE' ] = dDISCOUNT_PRICE ;
				item['PRICING_FORMULA'] = sPRICING_FORMULA;
				item['PRICING_FACTOR' ] = fPRICING_FACTOR ;
				this.UpdateDependancy('DISCOUNT_PRICE' , formatNumber(dDISCOUNT_PRICE, oNumberFormat));
				this.UpdateDependancy('PRICING_FORMULA', sPRICING_FORMULA);
				this.UpdateDependancy('PRICING_FACTOR' , fPRICING_FACTOR );
				//console.log((new Date()).toISOString() + ' ' + this.constructor.name + '.UpdateDiscount ' + gDISCOUNT_ID, dDISCOUNT_PRICE);
			}
		}
		else if ( !Sql.IsEmptyString(sPRICING_FORMULA) )
		{
			// 02/21/2021 Paul.  DiscountPrice() will return dDISCOUNT_PRICE unmodified if formula is blank or fixed. 
			dDISCOUNT_PRICE = DiscountPrice(sPRICING_FORMULA, fPRICING_FACTOR, dCOST_PRICE, dLIST_PRICE, dDISCOUNT_PRICE);
			item['DISCOUNT_PRICE' ] = dDISCOUNT_PRICE ;
			this.UpdateDependancy('DISCOUNT_PRICE' , formatNumber(dDISCOUNT_PRICE, oNumberFormat));
			//console.log((new Date()).toISOString() + ' ' + this.constructor.name + '.UpdateDiscount ' + sPRICING_FORMULA, dDISCOUNT_PRICE);
			
		}
		this.setState({ editedItem: item });
	}

	private _onUpdate = (PARENT_FIELD: string, DATA_VALUE: any, item?: any): void =>
	{
		//console.log((new Date()).toISOString() + ' ' + this.constructor.name + '._onUpdate ' + PARENT_FIELD, DATA_VALUE);
		let { dependents } = this.state;
		if ( dependents[PARENT_FIELD] )
		{
			let dependentIds = dependents[PARENT_FIELD];
			for ( let i = 0; i < dependentIds.length; i++ )
			{
				let ref = this.refMap[dependentIds[i].DATA_FIELD];
				if ( ref )
				{
					ref.current.updateDependancy(PARENT_FIELD, DATA_VALUE, dependentIds[i].PROPERTY_NAME, item);
				}
			}
		}
		if ( PARENT_FIELD == 'COST_PRICE' || PARENT_FIELD == 'LIST_PRICE' || PARENT_FIELD == 'PRICING_FORMULA' || PARENT_FIELD == 'DISCOUNT_ID' )
		{
			this.UpdateDiscount(PARENT_FIELD, DATA_VALUE);
		}
	}

	// 06/15/2018 Paul.  The SearchView will register for the onSubmit event. 
	private _onSubmit = (): void =>
	{
		try
		{
			if ( this.props.onSubmit )
			{
				//console.log((new Date()).toISOString() + ' ' + this.constructor.name + '._onSubmit');
				this.props.onSubmit();
			}
		}
		catch(error)
		{
			console.error((new Date()).toISOString() + ' ' + this.constructor.name + '._onSubmit', error);
			this.setState({ error });
		}
	}

	// 05/14/2018 Chase. This function will be passed to DynamicButtons to be called as Page_Command
	// Add additional params if you need access to the onClick event params.
	private Page_Command = async (sCommandName, sCommandArguments) =>
	{
		const { ID, MODULE_NAME, history, location } = this.props;
		const { LAST_DATE_MODIFIED } = this.state;
		//console.log((new Date()).toISOString() + ' ' + this.constructor.name + '.Page_Command ' + sCommandName, sCommandArguments, this.refMap)
		// This sets the local state, which is then passed to DynamicButtons
		try
		{
			let row;
			switch (sCommandName)
			{
				case 'Save':
				case 'SaveDuplicate':
				case 'SaveConcurrency':
				{
					let isDuplicate = location.pathname.includes('Duplicate');
					row = {
						ID: isDuplicate ? null : ID
					};
					// 08/27/2019 Paul.  Move build code to shared object. 
					let nInvalidFields: number = SplendidDynamic_EditView.BuildDataRow(row, this.refMap);
					if ( nInvalidFields == 0 )
					{
						if ( LAST_DATE_MODIFIED != null )
						{
							row['LAST_DATE_MODIFIED'] = LAST_DATE_MODIFIED;
						}
						if ( sCommandName == 'SaveDuplicate' || sCommandName == 'SaveConcurrency' )
						{
							row[sCommandName] = true;
						}
						try
						{
							if ( this.headerButtons.current != null )
							{
								this.headerButtons.current.Busy();
							}
							row.ID = await UpdateModule(MODULE_NAME, row, isDuplicate ? null : ID, true);
							history.push(`/Reset/Administration/${MODULE_NAME}/View/` + row.ID);
						}
						catch(error)
						{
							console.error((new Date()).toISOString() + ' ' + this.constructor.name + '.Page_Command ' + sCommandName, error);
							if ( this.headerButtons.current != null )
							{
								this.headerButtons.current.NotBusy();
							}
							if ( this._isMounted )
							{
								if ( error.message.includes('.ERR_DUPLICATE_EXCEPTION') )
								{
									if ( this.headerButtons.current != null )
									{
										this.headerButtons.current.ShowButton('SaveDuplicate', true);
									}
									this.setState( {error: L10n.Term(error.message) } );
								}
								else if ( error.message.includes('.ERR_CONCURRENCY_OVERRIDE') )
								{
									if ( this.headerButtons.current != null )
									{
										this.headerButtons.current.ShowButton('SaveConcurrency', true);
									}
									this.setState( {error: L10n.Term(error.message) } );
								}
								else
								{
									this.setState({ error });
								}
							}
						}
					}
					break;
				}
				case 'Cancel':
				{
					if ( Sql.IsEmptyString(ID) )
						history.push(`/Reset/Administration/${MODULE_NAME}/List`);
					else
						history.push(`/Reset/Administration/${MODULE_NAME}/View/${ID}`);
					break;
				}
				default:
				{
					if ( this._isMounted )
					{
						this.setState( {error: sCommandName + ' is not supported at this time'} );
					}
					break;
				}
			}
		}
		catch(error)
		{
			console.error((new Date()).toISOString() + ' ' + this.constructor.name + '.Page_Command ' + sCommandName, error);
			this.setState({ error });
		}
	}

	public render()
	{
		const { MODULE_NAME, ID, DuplicateID, callback } = this.props;
		const { item, layout, EDIT_NAME, SUB_TITLE, error } = this.state;
		const { __total, __sql } = this.state;
		// 05/04/2019 Paul.  Reference obserable IsInitialized so that terminology update will cause refresh. 
		//console.log((new Date()).toISOString() + ' ' + this.constructor.name + '.render: ' + EDIT_NAME, layout, item);
		// 09/09/2019 Paul.  We need to wait until item is loaded, otherwise fields will not get populated. 
		if ( layout == null || (item == null && (!Sql.IsEmptyString(ID) || !Sql.IsEmptyString(DuplicateID))) )
		{
			if ( error )
			{
				return (<ErrorComponent error={error} />);
			}
			else
			{
				return null;
			}
		}
		this.refMap = {};
		let onSubmit = (this.props.onSubmit ? this._onSubmit : null);
		if ( SplendidCache.IsInitialized && SplendidCache.AdminMenu )
		{
			// 12/04/2019 Paul.  After authentication, we need to make sure that the app gets updated. 
			Credentials.sUSER_THEME;
			let headerButtons = HeaderButtonsFactory(SplendidCache.UserTheme);
			return (
			<div>
				{ !callback && headerButtons
				? React.createElement(headerButtons, { MODULE_NAME, ID, SUB_TITLE, error, ButtonStyle: 'EditHeader', VIEW_NAME: EDIT_NAME, row: item, Page_Command: this.Page_Command, showButtons: true, history: this.props.history, location: this.props.location, match: this.props.match, ref: this.headerButtons })
				: null
				}
				<DumpSQL SQL={ __sql } />
				<div id={!!callback ? null : "content"}>
					{ SplendidDynamic_EditView.AppendEditViewFields(item, layout, this.refMap, callback, this._createDependency, null, this._onChange, this._onUpdate, onSubmit, 'tabForm', this.Page_Command) }
					<br />
				</div>
				{ !callback && headerButtons
				? <DynamicButtons
					ButtonStyle="EditHeader"
					VIEW_NAME={ EDIT_NAME }
					row={ item }
					Page_Command={ this.Page_Command }
					history={ this.props.history }
					location={ this.props.location }
					match={ this.props.match }
					ref={ this.dynamicButtonsBottom }
				/>
				: null
				}
			</div>
			);
		}
		else if ( error )
		{
			return (<ErrorComponent error={error} />);
		}
		else
		{
			return (
			<div id={ this.constructor.name + '_spinner' } style={ {textAlign: 'center'} }>
				<FontAwesomeIcon icon="spinner" spin={ true } size="5x" />
			</div>);
		}
	}
}
