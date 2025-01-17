/**********************************************************************************************************************
 * SplendidCRM is a Customer Relationship Management program created by SplendidCRM Software, Inc. 
 * Copyright (C) 2005-2022 SplendidCRM Software, Inc. All rights reserved.
 * 
 * This program is free software: you can redistribute it and/or modify it under the terms of the 
 * GNU Affero General Public License as published by the Free Software Foundation, either version 3 
 * of the License, or (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; 
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. 
 * See the GNU Affero General Public License for more details.
 * 
 * You should have received a copy of the GNU Affero General Public License along with this program. 
 * If not, see <http://www.gnu.org/licenses/>. 
 * 
 * You can contact SplendidCRM Software, Inc. at email address support@splendidcrm.com. 
 * 
 * In accordance with Section 7(b) of the GNU Affero General Public License version 3, 
 * the Appropriate Legal Notices must display the following words on all interactive user interfaces: 
 * "Copyright (C) 2005-2011 SplendidCRM Software, Inc. All rights reserved."
 *********************************************************************************************************************/
using System;
using System.Data;
using System.Text;
using System.Collections.Generic;
using System.Collections.Specialized;
using Spring.Json;

namespace Spring.Social.Office365.Api
{
	public class MyProfile : Entity
	{
		public String                UserPrincipalName { get; set; }
		public String                DisplayName       { get; set; }
		public String                GivenName         { get; set; }
		public String                Surname           { get; set; }
		public String                JobTitle          { get; set; }
		public String                Mail              { get; set; }
		public String                MobilePhone       { get; set; }
		public String                OfficeLocation    { get; set; }
		public String                PreferredLanguage { get; set; }
		public IList<String>         BusinessPhones    { get; set; }

		public MyProfile()
		{
			this.ODataType = "https://graph.microsoft.com/v1.0/$metadata#users/$entity";
		}
	}
}
