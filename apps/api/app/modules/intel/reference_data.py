CALIFORNIA_CODE_INDEX: list[dict] = [
    {
        "code_key": "PC-187",
        "code_family": "PC",
        "section": "187",
        "title": "Murder",
        "offense_level": "Felony",
        "summary": "Unlawful killing of a human being or fetus with malice aforethought.",
        "aliases": ["homicide", "intentional killing"],
        "keywords": ["killing", "death", "malice", "homicide"],
    },
    {
        "code_key": "PC-192",
        "code_family": "PC",
        "section": "192",
        "title": "Manslaughter",
        "offense_level": "Felony/Misdemeanor",
        "summary": "Unlawful killing without malice, including voluntary and involuntary manslaughter.",
        "aliases": ["voluntary manslaughter", "involuntary manslaughter"],
        "keywords": ["unlawful killing", "gross negligence"],
    },
    {
        "code_key": "PC-207",
        "code_family": "PC",
        "section": "207",
        "title": "Kidnapping",
        "offense_level": "Felony",
        "summary": "Taking, moving, or holding a person by force or fear.",
        "aliases": ["abduction"],
        "keywords": ["forcibly moved", "held against will", "abducted"],
    },
    {
        "code_key": "PC-211",
        "code_family": "PC",
        "section": "211",
        "title": "Robbery",
        "offense_level": "Felony",
        "summary": "Taking property from person or immediate presence by force or fear.",
        "aliases": ["strong arm robbery", "strong-armed", "strong armed"],
        "keywords": ["force", "fear", "stickup", "forcible theft"],
    },
    {
        "code_key": "PC-215",
        "code_family": "PC",
        "section": "215",
        "title": "Carjacking",
        "offense_level": "Felony",
        "summary": "Taking motor vehicle from another by force or fear.",
        "aliases": ["vehicle takeover"],
        "keywords": ["forcible vehicle theft", "carjacked"],
    },
    {
        "code_key": "PC-240",
        "code_family": "PC",
        "section": "240",
        "title": "Assault",
        "offense_level": "Misdemeanor",
        "summary": "Unlawful attempt with present ability to commit violent injury.",
        "aliases": ["simple assault"],
        "keywords": ["attempted strike", "attempted violence"],
    },
    {
        "code_key": "PC-242",
        "code_family": "PC",
        "section": "242",
        "title": "Battery",
        "offense_level": "Misdemeanor",
        "summary": "Willful and unlawful use of force or violence on another.",
        "aliases": ["simple battery"],
        "keywords": ["hit victim", "physical force", "struck person"],
    },
    {
        "code_key": "PC-245(a)(1)",
        "code_family": "PC",
        "section": "245(a)(1)",
        "title": "Assault With Deadly Weapon",
        "offense_level": "Felony/Misdemeanor",
        "summary": "Assault upon another with deadly weapon other than firearm.",
        "aliases": ["adw"],
        "keywords": ["knife assault", "weapon assault", "deadly weapon"],
    },
    {
        "code_key": "PC-273.5",
        "code_family": "PC",
        "section": "273.5",
        "title": "Corporal Injury To Spouse/Cohabitant",
        "offense_level": "Felony",
        "summary": "Willfully inflicting corporal injury causing traumatic condition on protected person.",
        "aliases": ["domestic violence felony"],
        "keywords": ["domestic violence", "intimate partner", "traumatic condition"],
    },
    {
        "code_key": "PC-422",
        "code_family": "PC",
        "section": "422",
        "title": "Criminal Threats",
        "offense_level": "Felony/Misdemeanor",
        "summary": "Threatening crime resulting in death or great bodily injury.",
        "aliases": ["terrorist threats"],
        "keywords": ["death threat", "gbi threat", "threatened to kill"],
    },
    {
        "code_key": "PC-459",
        "code_family": "PC",
        "section": "459",
        "title": "Burglary",
        "offense_level": "Felony/Misdemeanor",
        "summary": "Entry into structure or locked vehicle with intent to steal or commit felony.",
        "aliases": ["break in", "b and e"],
        "keywords": ["forced entry", "entered with intent", "home break in"],
    },
    {
        "code_key": "PC-484",
        "code_family": "PC",
        "section": "484",
        "title": "Theft",
        "offense_level": "Misdemeanor/Felony",
        "summary": "Taking another's property with intent to permanently deprive.",
        "aliases": ["petty theft", "larceny"],
        "keywords": ["stolen item", "shoplifting", "theft"],
    },
    {
        "code_key": "PC-487",
        "code_family": "PC",
        "section": "487",
        "title": "Grand Theft",
        "offense_level": "Felony/Misdemeanor",
        "summary": "Theft that meets value or property category threshold for grand theft.",
        "aliases": ["grand larceny"],
        "keywords": ["high value theft", "large property loss"],
    },
    {
        "code_key": "PC-496",
        "code_family": "PC",
        "section": "496",
        "title": "Receiving Stolen Property",
        "offense_level": "Felony/Misdemeanor",
        "summary": "Buying, receiving, concealing, or selling known stolen property.",
        "aliases": ["rsp", "possess stolen property"],
        "keywords": ["knew stolen", "fencing"],
    },
    {
        "code_key": "PC-594",
        "code_family": "PC",
        "section": "594",
        "title": "Vandalism",
        "offense_level": "Felony/Misdemeanor",
        "summary": "Maliciously damaging, defacing, or destroying property.",
        "aliases": ["graffiti", "property damage"],
        "keywords": ["tagging", "defaced property", "broken windows"],
    },
    {
        "code_key": "PC-646.9",
        "code_family": "PC",
        "section": "646.9",
        "title": "Stalking",
        "offense_level": "Felony/Misdemeanor",
        "summary": "Willful malicious harassment and repeated following with credible threat.",
        "aliases": ["harassing follow"],
        "keywords": ["credible threat", "repeated contact", "follows victim"],
    },
    {
        "code_key": "PC-148(a)(1)",
        "code_family": "PC",
        "section": "148(a)(1)",
        "title": "Resist/Delay/Obstruct Officer",
        "offense_level": "Misdemeanor",
        "summary": "Willfully resisting, delaying, or obstructing officer, EMT, or peace officer duties.",
        "aliases": ["resisting arrest", "obstructing officer"],
        "keywords": ["resisted", "delayed officer", "interfered with officer"],
    },
    {
        "code_key": "VC-23152",
        "code_family": "VC",
        "section": "23152",
        "title": "Driving Under The Influence",
        "offense_level": "Misdemeanor/Felony",
        "summary": "Driving under influence of alcohol or drugs, including prohibited BAC levels.",
        "aliases": ["dui", "dwi"],
        "keywords": ["drunk driving", "impaired driving", "intoxicated driver"],
    },
    {
        "code_key": "VC-20001",
        "code_family": "VC",
        "section": "20001",
        "title": "Hit and Run (Injury/Death)",
        "offense_level": "Felony",
        "summary": "Leaving scene of collision involving injury or death without required duties.",
        "aliases": ["felony hit and run"],
        "keywords": ["left scene", "injury collision", "failed to stop"],
    },
]

POLICY_SECTIONS: list[dict] = [
    {
        "section_id": "1.100",
        "title": "Mission, Values, and Duty to Intervene",
        "category": "Core Conduct",
        "tags": ["ethics", "integrity", "intervene", "constitutional policing"],
        "summary": "Establishes mission priorities and mandatory intervention for unsafe or unlawful conduct.",
        "body": (
            "Members preserve life, uphold constitutional rights, and use only lawful authority. "
            "Any member who observes objectively unreasonable force, unlawful detention, or rights-violating conduct "
            "shall intervene when safe and practical, notify a supervisor, and document the intervention in reporting."
        ),
    },
    {
        "section_id": "2.210",
        "title": "Use of Force Decision Model",
        "category": "Use of Force",
        "tags": ["force", "de-escalation", "necessity", "proportionality"],
        "summary": "Force must be objectively reasonable, necessary, and continually reassessed.",
        "body": (
            "De-escalation, distance, cover, and communication are preferred whenever feasible. "
            "Officers shall continuously reassess resistance, bystander risk, and available alternatives. "
            "All reportable force requires full narrative, evidence linkage, and supervisor review."
        ),
    },
    {
        "section_id": "2.245",
        "title": "Conducted Energy Device (Taser) Carry and Deployment",
        "category": "Use of Force",
        "tags": ["taser", "ced", "cross draw", "holster", "drive stun", "probe"],
        "summary": "Defines CED carry orientation, authorized uses, and post-deployment requirements.",
        "body": (
            "Issued CEDs should be carried in approved support-side configuration whenever practical. "
            "Cross-draw carry is permitted only by written authorization from Training Unit or Chief due to equipment or medical constraints. "
            "Authorized cross-draw members must complete annual transition training, maintain high-visibility CED markings, and verbally announce TASER when feasible. "
            "Drive-stun is not a substitute for probe deployment when probe deployment is safe and practical. "
            "After activation, members request medical evaluation, capture evidence photographs where lawful, and complete force reporting before end of shift."
        ),
    },
    {
        "section_id": "2.310",
        "title": "Pursuit and Emergency Vehicle Operations",
        "category": "Vehicle Operations",
        "tags": ["pursuit", "evoc", "termination", "supervisor"],
        "summary": "Restricts pursuits to serious threats and mandates active risk balancing.",
        "body": (
            "Vehicle pursuits are limited to violent felonies or imminent public danger when apprehension need outweighs risk. "
            "Supervisors shall monitor speed, route, weather, and identity confidence and terminate when risk becomes unreasonable."
        ),
    },
    {
        "section_id": "3.120",
        "title": "Domestic Violence Response",
        "category": "Investigations",
        "tags": ["domestic violence", "primary aggressor", "protective order", "lethality"],
        "summary": "Requires evidence-based domestic investigations and victim safety steps.",
        "body": (
            "Members separate involved parties, conduct independent statements, verify protective orders, and identify primary aggressor. "
            "Officers document injuries, digital evidence, witness statements, and safety resources provided to victim."
        ),
    },
    {
        "section_id": "3.220",
        "title": "Mental Health and Crisis Intervention",
        "category": "Investigations",
        "tags": ["mental health", "crisis", "de-escalation", "5150"],
        "summary": "Prioritizes crisis de-escalation, medical coordination, and legal hold articulation.",
        "body": (
            "For behavioral crisis events, officers reduce stimulation, slow scene tempo, and request crisis-trained support when available. "
            "Any involuntary hold decision must include clear articulation of risk behaviors and less-restrictive alternatives considered."
        ),
    },
    {
        "section_id": "5.130",
        "title": "Body-Worn Camera",
        "category": "Technology and Evidence",
        "tags": ["bodycam", "activation", "retention", "documentation"],
        "summary": "Defines mandatory recording events and required explanation for delayed activation.",
        "body": (
            "Body-worn cameras shall be activated for calls for service, stops, searches, arrests, and force incidents unless legally prohibited. "
            "Any delayed activation, interruption, or deactivation must be documented in incident narrative."
        ),
    },
    {
        "section_id": "6.210",
        "title": "Report Writing Quality Standards",
        "category": "Reporting",
        "tags": ["report writing", "narrative", "dictation", "facts"],
        "summary": "Requires objective fact-based narratives with legal basis and timeline clarity.",
        "body": (
            "Reports shall distinguish observation from inference, document legal basis for enforcement action, and include a coherent timeline. "
            "Dictated narratives must be reviewed for accuracy before submission. Supervisors may return incomplete reports for correction."
        ),
    },
]
