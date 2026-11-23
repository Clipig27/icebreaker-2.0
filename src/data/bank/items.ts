// ---------------------------------------------------------------------------
// Shared tagged ITEM BANK for Bid Wars (and any future game that needs
// concrete "things"). Pure data + a lazy parser: no React / RN imports, so
// verification scripts can load it under plain Node.
//
// One line per item:   Name|emoji|tag tag tag
//   - Names are unique across the whole bank (ids are derived from them).
//   - Tags are fine-grained SLOT tags (patty, pizza_topping, destination, ...)
//     plus a few MODIFIER tags used by theme variants (breakfast, spicy,
//     tropical, green, meat, veggie, dessert, cabin, beach, snow, city,
//     gamer, cozy, allsport, basketball, baseball, football, soccer, hockey,
//     nature, coastal, zombie, alien). A slot only ever accepts items
//     explicitly tagged for it.
//   - VIBE tags keep base recipes coherent: Dream House / Dream Vacation base
//     recipes only draw items WITHOUT a vibe tag (cabin/beach, beach/snow/city);
//     vibe items are only drawn by their own variant.
//   - SPORT tags: every game-day moment / gear / seat is tagged either
//     `allsport` (fits any sport) or with each sport it truly fits
//     (e.g. "Halftime show" = basketball football soccer — never baseball).
//   - Items are shared between themes on purpose (e.g. Jalapeños is a burger,
//     hot dog and pizza topping), so the bank stays compact.
// ---------------------------------------------------------------------------

const RAW = `
# --- burger: patties ---
Beef patty|🥩|patty
Smash patty|🍔|patty
Wagyu patty|🥩|patty
Bison patty|🦬|patty
Turkey patty|🦃|patty
Fried chicken|🍗|patty
Grilled chicken|🍗|patty pizza_topping meat
Veggie patty|🌱|patty
Black bean patty|🫘|patty
Salmon patty|🐟|patty
Lamb patty|🐑|patty
Pork sausage patty|🐖|patty breakfast
Portobello cap|🍄|patty
Crispy fish fillet|🐟|patty
Spicy chicken patty|🌶️|patty spicy
Chorizo patty|🐖|patty spicy
# --- cheeses ---
American cheese|🧀|cheese
Sharp cheddar|🧀|cheese pizza_cheese
Pepper jack|🧀|cheese pizza_cheese spicy
Swiss cheese|🧀|cheese
Smoked gouda|🧀|cheese pizza_cheese
Provolone|🧀|cheese pizza_cheese
Blue cheese crumbles|🧀|cheese pizza_cheese gross_food
Brie|🧀|cheese
Goat cheese|🐐|cheese pizza_cheese
Fresh mozzarella|🧀|cheese pizza_cheese
Ghost pepper cheese|🔥|cheese spicy
Cheese sauce|🧀|cheese hotdog_topping
Fried cheese curds|🧀|cheese
Muenster|🧀|cheese
Havarti|🧀|cheese
Feta crumbles|🧀|cheese pizza_cheese
Grilled halloumi|🧀|cheese
Pimento cheese|🧀|cheese
Parmesan crisp|🧀|cheese
Shredded mozzarella|🧀|pizza_cheese
Parmesan|🧀|pizza_cheese
Ricotta|🧀|pizza_cheese
Burrata|🧀|pizza_cheese
Pecorino|🧀|pizza_cheese
Fontina|🧀|pizza_cheese
# --- burger / hot dog toppings ---
Lettuce|🥬|burger_topping
Tomato slices|🍅|burger_topping
Red onion|🧅|burger_topping hotdog_topping pizza_topping veggie
Pickles|🥒|burger_topping hotdog_topping
Bacon|🥓|burger_topping hotdog_topping pizza_topping meat breakfast
Fried egg|🍳|burger_topping hotdog_topping breakfast
Avocado|🥑|burger_topping hotdog_topping smoothie_fruit green breakfast
Jalapeños|🌶️|burger_topping hotdog_topping pizza_topping spicy veggie
Mushrooms|🍄|burger_topping pizza_topping veggie
Grilled pineapple|🍍|burger_topping
Onion rings|🧅|burger_topping hotdog_topping
Caramelized onions|🧅|burger_topping hotdog_topping pizza_topping veggie
Hash brown|🥔|burger_topping breakfast
Coleslaw|🥗|burger_topping hotdog_topping
Mac & cheese|🍝|burger_topping hotdog_topping
Fried shrimp|🍤|burger_topping
Pulled pork|🐖|burger_topping hotdog_topping pizza_topping meat
Arugula|🌿|burger_topping pizza_topping veggie
Kimchi|🥬|burger_topping hotdog_topping spicy
Roasted red peppers|🫑|burger_topping pizza_topping veggie
Banana peppers|🫑|burger_topping hotdog_topping pizza_topping veggie
Crispy jalapeños|🌶️|burger_topping hotdog_topping spicy
Chili|🌶️|burger_topping hotdog_topping spicy
Crispy onion strings|🧅|burger_topping hotdog_topping
Pastrami|🥩|burger_topping
Tater tots|🥔|burger_topping hotdog_topping breakfast
Crushed potato chips|🥔|burger_topping hotdog_topping
Fried green tomatoes|🍅|burger_topping
Sauerkraut|🥬|burger_topping hotdog_topping gross_food
Pineapple salsa|🍍|burger_topping hotdog_topping
Mango salsa|🥭|burger_topping hotdog_topping
Candied bacon|🥓|burger_topping breakfast
Fried pickles|🥒|burger_topping hotdog_topping
Pickled red onions|🧅|burger_topping hotdog_topping
Crispy prosciutto|🥓|burger_topping
Roasted garlic|🧄|burger_topping pizza_topping veggie
Spicy slaw|🥗|burger_topping hotdog_topping spicy
Mozzarella sticks|🧀|burger_topping gameday_snack
Guacamole|🥑|burger_topping hotdog_topping
Sausage crumbles|🐖|burger_topping breakfast
Shoestring fries|🍟|burger_topping hotdog_topping
Scrambled eggs|🍳|burger_topping breakfast
Canadian bacon|🥓|burger_topping pizza_topping meat breakfast
Sautéed spinach|🥬|burger_topping breakfast
Pico de gallo|🍅|burger_topping hotdog_topping
Sweet relish|🥒|hotdog_topping burger_topping
Sport peppers|🌶️|hotdog_topping spicy
Celery salt|🧂|hotdog_topping
Pickle spear|🥒|hotdog_topping
Grilled peppers & onions|🫑|hotdog_topping
Shredded cheddar|🧀|hotdog_topping
Corn chip crunch|🌽|hotdog_topping
Crispy garlic|🧄|hotdog_topping
Cotija cheese|🧀|hotdog_topping
Elote corn|🌽|hotdog_topping festival_food
Green onions|🌱|hotdog_topping
Diced tomatoes|🍅|hotdog_topping
# --- sauces & condiments ---
Ketchup|🍅|sauce condiment gross_food
Yellow mustard|🟡|sauce condiment gross_food
Spicy brown mustard|🟤|sauce condiment
Dijon mustard|🟡|sauce condiment
Mayo|🥚|sauce gross_food
Garlic aioli|🧄|sauce
BBQ sauce|🍖|sauce condiment pizza_sauce
Special sauce|🥫|sauce
Sriracha|🌶️|sauce condiment spicy
Sriracha mayo|🔥|sauce condiment spicy
Chipotle mayo|🌶️|sauce spicy
Buffalo sauce|🔥|sauce condiment pizza_sauce spicy
Hot honey|🍯|sauce pizza_sauce spicy
Honey mustard|🍯|sauce condiment
Ranch|🥗|sauce pizza_sauce gross_food
Truffle mayo|🍄|sauce
Teriyaki glaze|🥢|sauce
Fig jam|🫙|sauce
Pesto|🌿|sauce pizza_sauce
Maple syrup drizzle|🍁|sauce breakfast
Hollandaise|🍳|sauce breakfast
Habanero salsa|🌶️|sauce condiment spicy
Thousand Island|🥫|sauce
Tzatziki|🥒|sauce
Steak sauce|🥩|sauce
Horseradish cream|🫙|sauce
Gochujang mayo|🌶️|sauce spicy
Hot sauce|🌶️|condiment spicy
Japanese mayo|🥚|condiment
# --- hot dogs ---
Classic beef frank|🌭|hotdog_style
Bratwurst|🌭|hotdog_style gameday_snack
Polish sausage|🌭|hotdog_style
Italian sausage|🌭|hotdog_style pizza_topping meat
Chorizo|🌶️|hotdog_style pizza_topping meat spicy
Andouille sausage|🌭|hotdog_style spicy
Jumbo foot-long|📏|hotdog_style
Bacon-wrapped dog|🥓|hotdog_style
Veggie dog|🌱|hotdog_style
Chicken sausage|🐔|hotdog_style
Kielbasa|🌭|hotdog_style
Hot link|🔥|hotdog_style spicy
Cheddar-stuffed frank|🧀|hotdog_style
Turkey dog|🦃|hotdog_style
Knockwurst|🌭|hotdog_style
# --- pizza ---
Garlic butter crust|🧄|pizza_crust
Stuffed cheese crust|🧀|pizza_crust
Parmesan-crusted edge|🧀|pizza_crust
Everything-bagel crust|🥯|pizza_crust
Sesame crust|🌾|pizza_crust
Cajun-spiced crust|🌶️|pizza_crust
Pretzel-salt crust|🥨|pizza_crust
Honey-butter crust|🍯|pizza_crust
Herb crust|🌿|pizza_crust
Marinara|🍅|pizza_sauce
Spicy arrabbiata|🌶️|pizza_sauce
White garlic sauce|🧄|pizza_sauce
Vodka sauce|🍅|pizza_sauce
Alfredo sauce|🥛|pizza_sauce
Olive oil & garlic|🫒|pizza_sauce
Balsamic glaze|🫙|pizza_sauce
Pepperoni|🍕|pizza_topping meat
Ham|🍖|pizza_topping meat
Meatballs|🧆|pizza_topping meat
Salami|🍖|pizza_topping meat
Prosciutto|🥓|pizza_topping meat
BBQ chicken|🍗|pizza_topping meat
Buffalo chicken|🍗|pizza_topping meat
Ground beef|🥩|pizza_topping meat
Soppressata|🍖|pizza_topping meat
Pancetta|🥓|pizza_topping meat
Spicy capicola|🍖|pizza_topping meat
Anchovies|🐟|pizza_topping gross_food
Shrimp|🍤|pizza_topping
Pineapple|🍍|pizza_topping smoothie_fruit tropical
Green peppers|🫑|pizza_topping veggie
Black olives|🫒|pizza_topping veggie
Kalamata olives|🫒|pizza_topping veggie
Baby spinach|🥬|pizza_topping veggie
Cherry tomatoes|🍅|pizza_topping veggie
Sun-dried tomatoes|🍅|pizza_topping veggie
Artichoke hearts|🥬|pizza_topping veggie
Fresh basil|🌿|pizza_topping veggie
Sweet corn|🌽|pizza_topping veggie
Broccoli|🥦|pizza_topping veggie
Zucchini|🥒|pizza_topping veggie
Eggplant|🍆|pizza_topping veggie
Chili flakes|🌶️|pizza_topping
Truffle oil drizzle|🍄|pizza_topping
# --- smoothie ---
Banana|🍌|smoothie_fruit tropical
Strawberries|🍓|smoothie_fruit
Blueberries|🫐|smoothie_fruit
Mango|🥭|smoothie_fruit tropical
Raspberries|🍓|smoothie_fruit
Blackberries|🫐|smoothie_fruit
Peach|🍑|smoothie_fruit
Kiwi|🥝|smoothie_fruit green
Watermelon|🍉|smoothie_fruit
Cherries|🍒|smoothie_fruit
Passion fruit|🌴|smoothie_fruit tropical
Dragon fruit|🐉|smoothie_fruit tropical
Guava|🌴|smoothie_fruit tropical
Papaya|🌴|smoothie_fruit tropical
Lychee|🌴|smoothie_fruit tropical
Starfruit|⭐|smoothie_fruit tropical
Coconut meat|🥥|smoothie_fruit tropical
Orange|🍊|smoothie_fruit
Blood orange|🍊|smoothie_fruit
Green apple|🍏|smoothie_fruit green
Pear|🍐|smoothie_fruit green
Grapes|🍇|smoothie_fruit
Acai berries|🫐|smoothie_fruit
Honeydew melon|🍈|smoothie_fruit green
Cantaloupe|🍈|smoothie_fruit
Apricot|🍑|smoothie_fruit
Nectarine|🍑|smoothie_fruit
Almond milk|🥛|smoothie_base
Oat milk|🥛|smoothie_base
Whole milk|🥛|smoothie_base
Soy milk|🥛|smoothie_base
Cashew milk|🥜|smoothie_base
Coconut milk|🥥|smoothie_base tropical
Coconut water|🥥|smoothie_base tropical
Pineapple juice|🍍|smoothie_base tropical
Greek yogurt|🥛|smoothie_base
Vanilla yogurt|🍦|smoothie_base
Frozen yogurt|🍦|smoothie_base
Kefir|🥛|smoothie_base
Orange juice|🍊|smoothie_base
Apple juice|🧃|smoothie_base
Cold brew coffee|☕|smoothie_base
Green tea|🍵|smoothie_base green
Crushed ice|🧊|smoothie_base
Protein powder|💪|smoothie_boost
Peanut butter|🥜|smoothie_boost apocalypse_supply
Almond butter|🥜|smoothie_boost
Honey|🍯|smoothie_boost apocalypse_supply
Chia seeds|🌱|smoothie_boost
Flax seeds|🌾|smoothie_boost
Rolled oats|🌾|smoothie_boost
Cocoa powder|🍫|smoothie_boost
Spinach|🥬|smoothie_boost green
Kale|🥬|smoothie_boost green
Ginger|🫚|smoothie_boost
Matcha|🍵|smoothie_boost green
Cinnamon|🪵|smoothie_boost
Vanilla extract|🍦|smoothie_boost
Dates|🌴|smoothie_boost
Maple syrup|🍁|smoothie_boost
Mint leaves|🌿|smoothie_boost green
Spirulina|🟢|smoothie_boost green
Cucumber|🥒|smoothie_boost green
Celery|🌿|smoothie_boost green
Wheatgrass shot|🌾|smoothie_boost green
Lime juice|🍋|smoothie_boost tropical
Lemon squeeze|🍋|smoothie_boost
Turmeric|🟡|smoothie_boost
Toasted coconut flakes|🥥|smoothie_boost tropical
Hemp hearts|🌱|smoothie_boost
Cacao nibs|🍫|smoothie_boost
Espresso shot|☕|smoothie_boost
# --- cursed: gross single ingredients (PG, all edible) ---
Sardines|🐟|gross_food
Gummy worms|🪱|gross_food
Pickle juice|🥒|gross_food
Canned peas|🟢|gross_food
Marshmallow fluff|☁️|gross_food
Raw onion|🧅|gross_food
Olive brine|🫒|gross_food
Cold spaghetti|🍝|gross_food
Liver pâté|🫙|gross_food
Pickled herring|🐟|gross_food
Black licorice|🖤|gross_food
Durian|🤢|gross_food
Canned tuna|🐟|gross_food
Fish sauce|🫙|gross_food
Natto|🫘|gross_food
Raw garlic clove|🧄|gross_food
Brussels sprouts|🥬|gross_food
Cottage cheese|🥛|gross_food
Instant coffee granules|☕|gross_food
Lime jello|🟢|gross_food
Cold oatmeal|🥣|gross_food
Soggy cereal|🥣|gross_food
Mint jelly|🌿|gross_food
Pickled beets|🔴|gross_food
Fruitcake|🎂|gross_food
Candy corn|🌽|gross_food
Tapioca pudding|🍮|gross_food
Wasabi paste|🟢|gross_food
Baby food purée|🍼|gross_food
Pickled eggs|🥚|gross_food
Clam juice|🐚|gross_food
Canned spinach|🥫|gross_food
# --- cursed: combos ---
Ketchup ice cream|🍦|cursed_combo dessert
Broccoli milkshake|🥦|cursed_combo dessert
Mustard pudding|🍮|cursed_combo dessert
Cotton candy chili|🍭|cursed_combo
Sauerkraut soda|🥤|cursed_combo
Garlic gummies|🧄|cursed_combo dessert
Chocolate pickle|🍫|cursed_combo dessert
Squid jelly beans|🦑|cursed_combo dessert
Tuna jam|🐠|cursed_combo
Hot sauce cereal|🥣|cursed_combo breakfast
Mayo pancakes|🥞|cursed_combo breakfast
Pickle-juice coffee|☕|cursed_combo breakfast
Sardine sundae|🍨|cursed_combo dessert
Onion cupcake|🧁|cursed_combo dessert
Ranch milkshake|🥤|cursed_combo dessert
Gravy ice cream|🍦|cursed_combo dessert
Anchovy brownies|🍫|cursed_combo dessert
Kale cotton candy|🍭|cursed_combo dessert
Pickle popsicle|🥒|cursed_combo dessert
Wasabi whipped cream|🍨|cursed_combo dessert
Peanut butter & pickle sandwich|🥪|cursed_combo
Spaghetti waffles|🧇|cursed_combo breakfast
Cereal with orange juice|🥣|cursed_combo breakfast
Ketchup toast|🍞|cursed_combo breakfast
Mustard oatmeal|🥣|cursed_combo breakfast
Hot dog smoothie|🌭|cursed_combo
Gummy worm soup|🍜|cursed_combo
Clam chowder slushie|🧊|cursed_combo
Tuna milkshake|🥤|cursed_combo dessert
Mac & cheese ice cream|🍦|cursed_combo dessert
Gummy bear pizza|🍕|cursed_combo
Marshmallow nachos|🧀|cursed_combo
Chocolate-covered onion rings|🧅|cursed_combo dessert
Cheese puff cereal|🥣|cursed_combo breakfast
Mayo latte|☕|cursed_combo breakfast
Egg yolk lemonade|🍋|cursed_combo
Banana ketchup burrito|🌯|cursed_combo
Sprinkle-crusted sardines|🐟|cursed_combo
Licorice lasagna|🍝|cursed_combo
Tuna jello salad|🟢|cursed_combo
Hummus hot chocolate|☕|cursed_combo dessert
Soy sauce ice cream|🍦|cursed_combo dessert
Cotton candy burrito|🌯|cursed_combo
Bubblegum broccoli|🥦|cursed_combo
Coffee-ground cookies|🍪|cursed_combo dessert
Gravy pancakes|🥞|cursed_combo breakfast
Cereal in cola|🥤|cursed_combo breakfast
Gummy worm omelet|🍳|cursed_combo breakfast
Mustard-glazed donut|🍩|cursed_combo breakfast dessert
Sardine cereal|🥣|cursed_combo breakfast
Fish stick sundae|🍨|cursed_combo dessert
Pickle pancakes|🥞|cursed_combo breakfast
Jelly bean chili|🌶️|cursed_combo
Mayo cotton candy|🍭|cursed_combo dessert
# --- dream house: rooms ---
Home theater|🎬|room
Game room|🎮|room
Library|📚|room
Home gym|🏋️|room
Recording studio|🎙️|room
Art studio|🎨|room
Chef's kitchen|👨‍🍳|room
Walk-in closet|👗|room bedroom_item
Sauna|🧖|room cabin
Arcade room|🕹️|room
Bowling alley|🎳|room
Panic room|🚪|room
Music room|🎹|room
Sunroom|☀️|room beach
Candy room|🍬|room
Pet spa room|🐶|room
Craft room|✂️|room
Ballroom|💃|room
Trophy room|🏆|room
Home office|💻|room
Escape room|🔐|room
Karaoke room|🎤|room
Ski room|🎿|room cabin
Surfboard room|🏄|room beach
Lego room|🧱|room
Planetarium|🌌|room
Snack pantry|🍿|room
Spa bathroom|🛁|room
Dance studio|🩰|room
Billiards room|🎱|room
Reading nook|📖|room bedroom_decor cozy
Hidden lounge|🕵️|room
Fireplace den|🔥|room cabin
Bunk room|🛏️|room cabin
Lodge-style great room|🦌|room cabin
# --- dream house: features ---
Infinity pool|🏊|home_feature beach
Treehouse|🌳|home_feature cabin
Secret passage|🚪|home_feature
Rooftop garden|🌻|home_feature
Indoor slide|🛝|home_feature
Indoor pool|🏊|home_feature
Hot tub|♨️|home_feature cabin beach
Basketball court|🏀|home_feature
Aquarium wall|🐠|home_feature
Observatory|🔭|home_feature
Giant fireplace|🔥|home_feature cabin
Helipad|🚁|home_feature
Backyard rollercoaster|🎢|home_feature
Lazy river|🛟|home_feature beach
Waterslide into the pool|💦|home_feature beach
Rock-climbing wall|🧗|home_feature
Greenhouse|🌿|home_feature
Zipline|🌲|home_feature cabin
Tennis court|🎾|home_feature
Mini golf course|⛳|home_feature
Koi pond|🐟|home_feature
Wraparound porch|🪑|home_feature cabin
Ocean-view deck|🌊|home_feature beach
Private dock|⚓|home_feature cabin beach
Outdoor shower|🚿|home_feature beach
Fire pit|🔥|home_feature cabin beach
Glass-floor balcony|🪟|home_feature
Hidden bookshelf door|📚|home_feature
Underground garage|🏎️|home_feature
Moat|🏰|home_feature
Drive-in movie lawn|🎞️|home_feature
Skate ramp|🛹|home_feature
Fireman's pole|🚒|home_feature
Spiral staircase|🌀|home_feature
Glass ceiling|✨|home_feature
Hammock grove|🌴|home_feature beach
Private beach|🏖️|home_feature beach
Ski-in ski-out door|⛷️|home_feature cabin
Rope bridge|🌉|home_feature cabin
# --- dream house: amenities ---
Robot butler|🤖|home_amenity
Personal chef|👨‍🍳|home_amenity travel_perk
Ice cream bar|🍨|home_amenity
Popcorn machine|🍿|home_amenity
Heated floors|🌡️|home_amenity cabin
Elevator|🛗|home_amenity
Smart lights|💡|home_amenity
Massage chair|💺|home_amenity bedroom_item
Candy wall|🍬|home_amenity
Soda fountain|🥤|home_amenity
Pizza oven|🍕|home_amenity
Self-cleaning rooms|🧽|home_amenity
Espresso bar|☕|home_amenity
Hot cocoa station|🍫|home_amenity cabin
Smoothie bar|🥤|home_amenity beach
Tiki snack bar|🌴|home_amenity beach
BBQ grill station|🍖|home_amenity
Surround sound|🔊|home_amenity
Giant TV wall|📺|home_amenity
Nap pods|😴|home_amenity
Laundry chute|🧺|home_amenity
Stacked firewood|🪵|home_amenity cabin
Snowmobile|🛷|home_amenity cabin
Kayaks|🛶|home_amenity cabin beach roadtrip_gear nature coastal
Paddleboards|🏄|home_amenity beach
Wood stove|🪵|home_amenity cabin
Endless hot water|🚿|home_amenity
Snack vending machine|🥫|home_amenity
Indoor herb garden|🌱|home_amenity
Robot vacuum fleet|🤖|home_amenity
Smart fridge|🧊|home_amenity
# --- dream bedroom: big items ---
King-size bed|🛏️|bedroom_item cozy
Canopy bed|🛏️|bedroom_item cozy
Loft bed|🪜|bedroom_item
Waterbed|💧|bedroom_item
Hammock|🪢|bedroom_item roadtrip_gear nature
Bean bag|🫘|bedroom_item gamer cozy
Gaming chair|🪑|bedroom_item gamer
Triple-monitor setup|🖥️|bedroom_item gamer
Gaming PC|💻|bedroom_item gamer
Console collection|🎮|bedroom_item gamer
VR headset|🥽|bedroom_item gamer
Racing sim rig|🏎️|bedroom_item gamer
Arcade cabinet|🕹️|bedroom_item gamer
Mini fridge|🧊|bedroom_item gamer
Projector|📽️|bedroom_item
Bookshelf|📚|bedroom_item cozy
Record player|🎶|bedroom_item cozy
Telescope|🔭|bedroom_item
Aquarium|🐠|bedroom_item
Ensuite bathroom|🛁|bedroom_item
Balcony|🌅|bedroom_item
Secret door|🚪|bedroom_item
Standing desk|🧍|bedroom_item
Vanity mirror|🪞|bedroom_item
Window seat|🪟|bedroom_item cozy
Reading armchair|🛋️|bedroom_item cozy
Snack drawer|🍿|bedroom_item gamer
Hanging egg chair|🪑|bedroom_item cozy
Slide to the kitchen|🛝|bedroom_item
Wall-mounted TV|📺|bedroom_item gamer
Electric fireplace|🔥|bedroom_item cozy
Skylight|✨|bedroom_item
Rotating bookshelf door|📚|bedroom_item
# --- dream bedroom: decor ---
LED lights|💡|bedroom_decor gamer
Fairy lights|✨|bedroom_decor cozy
Jungle of plants|🪴|bedroom_decor
Galaxy projector|🌌|bedroom_decor
Lava lamp|🫧|bedroom_decor
Poster collection|🖼️|bedroom_decor gamer
Gallery wall|🖼️|bedroom_decor
Fluffy rug|🧶|bedroom_decor cozy
Weighted blanket|🧣|bedroom_decor cozy
Throw pillow mountain|🛋️|bedroom_decor cozy
Blackout curtains|🌑|bedroom_decor
Glow-in-the-dark stars|⭐|bedroom_decor
Cloud ceiling|☁️|bedroom_decor
Mural wall|🎨|bedroom_decor
Pet cat|🐈|bedroom_decor cozy
Sleepy dog|🐕|bedroom_decor cozy
Scented candles|🕯️|bedroom_decor cozy
Rain-sound machine|🌧️|bedroom_decor cozy
Smart speaker|🔊|bedroom_decor
Disco ball|🪩|bedroom_decor
Trophy shelf|🏆|bedroom_decor
Figure collection|🦸|bedroom_decor gamer
Plushie pile|🧸|bedroom_decor cozy
Hanging plants|🌿|bedroom_decor
RGB keyboard|⌨️|bedroom_decor gamer
Headset stand|🎧|bedroom_decor gamer
Acoustic foam panels|🔇|bedroom_decor gamer
Giant desk mat|🖱️|bedroom_decor gamer
Bed fort canopy|⛺|bedroom_decor cozy
Heated blanket|🔥|bedroom_decor cozy
Map wall|🗺️|bedroom_decor
Dreamcatcher|🕸️|bedroom_decor
Bonsai tree|🌳|bedroom_decor
Neon sign|🔆|bedroom_decor gamer
# --- dream vacation: destinations ---
Paris|🗼|destination city
Tokyo|🗾|destination city
Rome|🏛️|destination city
New York City|🗽|destination city
London|💂|destination city
Barcelona|⛪|destination city
Sydney|🦘|destination city beach
Rio de Janeiro|🎉|destination city beach
Kyoto|⛩️|destination city
Seoul|🏙️|destination city
Bangkok|🛺|destination city
Dubai|🏙️|destination city
Cairo|🐪|destination city
Lisbon|🚋|destination city
Amsterdam|🚲|destination city
Venice|🛶|destination city
Singapore|🌆|destination city
Marrakech|🕌|destination city
Los Angeles|🎬|destination city beach
Maldives|🏝️|destination beach
Bali|🌺|destination beach
Hawaii|🌺|destination beach
Cancún|🌮|destination beach
Santorini|🌅|destination beach
Bora Bora|🏝️|destination beach
Fiji|🐠|destination beach
Turks and Caicos|🏝️|destination beach
Amalfi Coast|🍋|destination beach
Great Barrier Reef|🐠|destination beach
Cape Town|🐧|destination beach city
Swiss Alps|🏔️|destination snow
Aspen|⛷️|destination snow
Whistler|🎿|destination snow
Iceland|🌋|destination snow
Lapland|🦌|destination snow
Banff|🏞️|destination snow
Hokkaido|❄️|destination snow
Chamonix|🏔️|destination snow
Machu Picchu|🦙|destination
Grand Canyon|🏜️|destination
Serengeti|🦁|destination
New Zealand|🐑|destination
Costa Rica|🦥|destination
Galápagos Islands|🐢|destination
Orlando|🎢|destination
Patagonia|🏔️|destination
Yellowstone|🦬|destination
Petra|🏜️|destination
Angkor Wat|🛕|destination
Amazon rainforest|🌳|destination
Victoria Falls|💦|destination
Scottish Highlands|🏰|destination
Tuscany|🍇|destination
# --- dream vacation: lodging ---
Beach villa|🏝️|lodging beach
Overwater bungalow|🛖|lodging beach
Luxury cruise cabin|🛳️|lodging beach
Cliffside resort|🌅|lodging beach
Ski chalet|🏠|lodging snow
Igloo hotel|🧊|lodging snow
Glass cabin under the stars|✨|lodging snow
Ice hotel|❄️|lodging snow
Mountain lodge|🏔️|lodging snow
Penthouse suite|🏙️|lodging city
Boutique hotel|🏨|lodging city
Rooftop suite|🌆|lodging city
Royal palace suite|👑|lodging city
Capsule hotel|🛏️|lodging city
Treehouse hotel|🌳|lodging
Castle stay|🏰|lodging
Glamping tent|⛺|lodging festival_perk
Houseboat|🛥️|lodging apocalypse_base
Desert dome|🏜️|lodging
Safari lodge|🦁|lodging
Jungle eco-lodge|🌿|lodging
Vineyard villa|🍇|lodging
Countryside inn|🏡|lodging
Lakeside cabin|🛶|lodging
# --- dream vacation: activities ---
Safari drive|🦁|activity
Hot air balloon ride|🎈|activity
Scuba diving|🤿|activity beach
Snorkeling with turtles|🐢|activity beach
Swim with dolphins|🐬|activity beach
Surf lessons|🏄|activity beach
Jet skiing|🌊|activity beach
Sunset sailing|⛵|activity beach
Parasailing|🪂|activity beach
Beach volleyball|🏐|activity beach
Whale watching|🐋|activity beach
Kayaking|🛶|activity beach
Island hopping|🏝️|activity beach
Skiing|⛷️|activity snow
Snowboarding|🏂|activity snow
Dog sledding|🐕|activity snow
Northern lights tour|🌌|activity snow
Snowmobile tour|🛷|activity snow
Ice skating|⛸️|activity snow city
Hot springs soak|♨️|activity snow
Gondola ride|🚡|activity snow
Sledding|🛷|activity snow
Snowball fight|❄️|activity snow
Mountain hike|🏔️|activity
Zip-lining|🌲|activity
Skydiving|🪂|activity
Bungee jumping|🪢|activity
Theme park day|🎢|activity city
Food tour|🍜|activity city
Museum hopping|🖼️|activity city
Rooftop dinner|🍽️|activity city
Broadway show|🎭|activity city
Street-food crawl|🥟|activity city
Cooking class|👩‍🍳|activity city
Shopping spree|🛍️|activity city
Bike tour|🚲|activity city
Concert night|🎫|activity city
Helicopter tour|🚁|activity
Spa day|💆|activity
Volcano hike|🌋|activity
Cave exploring|🔦|activity
River rafting|🚣|activity
Horseback ride|🐎|activity
Stargazing|🔭|activity
Waterfall swim|💦|activity
Canopy walk|🌳|activity
Scenic train ride|🚂|activity
# --- dream vacation: perks ---
Private jet|✈️|travel_perk
First-class seats|💺|travel_perk
Butler service|🤵|travel_perk
Unlimited room service|🛎️|travel_perk
Five-star buffet|🍽️|travel_perk
Private tour guide|🧭|travel_perk
Skip-the-line passes|🎟️|travel_perk
Free upgrades|⬆️|travel_perk
Personal photographer|📸|travel_perk
Daily massages|💆|travel_perk
Late checkout|⏰|travel_perk
Airport lounge access|🛋️|travel_perk
Chauffeured car|🚘|travel_perk
Unlimited souvenirs|🎁|travel_perk
Ocean-view balcony|🌊|travel_perk beach
Private yacht|🛥️|travel_perk beach
Beach cabana|🏖️|travel_perk beach
Fresh coconut delivery|🥥|travel_perk beach
Bottomless smoothies|🥤|travel_perk beach
Fireside hot cocoa|☕|travel_perk snow
Heated ski boots|🥾|travel_perk snow
Ski valet|🎿|travel_perk snow
Private ski instructor|⛷️|travel_perk snow
Rooftop pool|🌆|travel_perk city
VIP concert passes|🎫|travel_perk city
# --- game day: snacks ---
Nachos|🧀|gameday_snack
Hot wings|🍗|gameday_snack
Stadium hot dog|🌭|gameday_snack
Soft pretzel|🥨|gameday_snack festival_food
Loaded fries|🍟|gameday_snack festival_food
Popcorn|🍿|gameday_snack roadtrip_snack
Sliders|🍔|gameday_snack
Pizza by the slice|🍕|gameday_snack
Garlic knots|🧄|gameday_snack
Cotton candy|🍭|gameday_snack festival_food
Churros|🍩|gameday_snack festival_food
Roasted peanuts|🥜|gameday_snack
Caramel corn|🍿|gameday_snack
Seven-layer dip|🥣|gameday_snack
Buffalo chicken dip|🔥|gameday_snack
Chili cheese fries|🌶️|gameday_snack
Pulled pork sliders|🐖|gameday_snack
BBQ ribs|🍖|gameday_snack
Giant turkey leg|🍗|gameday_snack festival_food
Mini corn dogs|🌭|gameday_snack festival_food
Ice cream sundae|🍨|gameday_snack
Queso dip|🧀|gameday_snack
Guac & chips|🥑|gameday_snack
Jalapeño poppers|🌶️|gameday_snack
Pigs in a blanket|🌭|gameday_snack
Sunflower seeds|🌻|gameday_snack roadtrip_snack
Smoked brisket|🥩|gameday_snack
# --- game day: moments (allsport = fits every sport; else each sport it fits) ---
Kiss cam appearance|😘|gameday_moment allsport
T-shirt cannon catch|👕|gameday_moment allsport
Jumbotron dance-off|🕺|gameday_moment allsport
Starting the wave|🌊|gameday_moment allsport
Mascot high-five|🙌|gameday_moment allsport
Halftime show|🎤|gameday_moment basketball football soccer
Overtime thriller|⏰|gameday_moment basketball football hockey
Fireworks after a win|🎆|gameday_moment baseball football soccer
Getting on TV|📺|gameday_moment allsport
Proposal on the Jumbotron|💍|gameday_moment allsport
Mascot race|🏃|gameday_moment allsport
Player autographs|✍️|gameday_moment allsport
Championship parade|🏆|gameday_moment allsport
Locker-room tour|🔑|gameday_moment allsport
Free tacos for the whole crowd|🌮|gameday_moment allsport
Confetti blast|🎊|gameday_moment allsport
Beating the rival|🥊|gameday_moment allsport
Bobblehead giveaway|🧸|gameday_moment allsport
Half-court shot contest|🏀|gameday_moment basketball
Buzzer-beater|⏱️|gameday_moment basketball
Courtside celebrity sighting|🌟|gameday_moment basketball
Slam dunk|🏀|gameday_moment basketball
Sweatband toss from a star|🏀|gameday_moment basketball
Triple-double|🏀|gameday_moment basketball
Alley-oop|🏀|gameday_moment basketball
Catching a foul ball|⚾|gameday_moment baseball
Seventh-inning stretch song|🎶|gameday_moment baseball
Grand slam|⚾|gameday_moment baseball
Walk-off home run|⚾|gameday_moment baseball
Throwing out the first pitch|⚾|gameday_moment baseball
Rally cap moment|🧢|gameday_moment baseball
Game-winning field goal|🏈|gameday_moment football
Hail Mary touchdown|🏈|gameday_moment football
Ice bucket shower for the coach|🧊|gameday_moment football
Pregame tailgate party|🚙|gameday_moment football
Marching band halftime|🥁|gameday_moment football
Coin toss on the field|🪙|gameday_moment football soccer
Touchdown dance|💃|gameday_moment football
Pick-six|🏈|gameday_moment football
Fourth-quarter comeback|🔥|gameday_moment football
Last-minute winner|⚽|gameday_moment soccer
Bicycle-kick goal|⚽|gameday_moment soccer
Penalty shootout|🥅|gameday_moment soccer
Stadium-wide chant|🎶|gameday_moment soccer
Giant tifo reveal|🎨|gameday_moment soccer
Free-kick screamer|⚽|gameday_moment soccer
Hat-trick hat toss|🎩|gameday_moment hockey
Zamboni ride|🧊|gameday_moment hockey
Puck over the glass|🏒|gameday_moment hockey
Shootout winner|🥅|gameday_moment hockey
Goal horn blast|📯|gameday_moment hockey
# --- game day: fan gear ---
Foam finger|👆|sports_gear allsport
Face paint|🎨|sports_gear allsport
Team jersey|👕|sports_gear allsport
Rally towel|🧣|sports_gear allsport
Big-head cutout|🖼️|sports_gear allsport
Air horn|📯|sports_gear allsport
Cowbell|🔔|sports_gear allsport
Team scarf|🧣|sports_gear allsport
Lucky socks|🧦|sports_gear allsport
Stadium blanket|🛌|sports_gear baseball football soccer
Seat cushion|💺|sports_gear allsport
Binoculars|🔭|sports_gear allsport roadtrip_gear nature apocalypse_supply
Thundersticks|🎈|sports_gear allsport
Championship ring replica|💍|sports_gear allsport
Team cap|🧢|sports_gear allsport
Megaphone|📣|sports_gear allsport
Team pennant|🚩|sports_gear allsport
Signed soccer ball|⚽|sports_gear soccer
Supporters' flag|🚩|sports_gear soccer
Vuvuzela|📯|sports_gear soccer
Signed hockey stick|🏒|sports_gear hockey
Signed puck|🏒|sports_gear hockey
Knit team beanie|🧢|sports_gear hockey football
Signed basketball|🏀|sports_gear basketball
Mini hoop|🏀|sports_gear basketball
Retro sneakers|👟|sports_gear basketball
Signed baseball|⚾|sports_gear baseball
Baseball glove|🧤|sports_gear baseball
Scorecard & pencil|✏️|sports_gear baseball
Signed football|🏈|sports_gear football
Portable grill|🔥|sports_gear football
Cornhole set|🎯|sports_gear football roadtrip_gear
Cooler|🧊|sports_gear football roadtrip_gear
Hand warmers|🧤|sports_gear football soccer
Tailgate tent|⛺|sports_gear football
# --- game day: seats & access ---
Front-row seats|💺|gameday_seat allsport
Luxury suite|🛋️|gameday_seat allsport
Field-level club seats|🎟️|gameday_seat baseball football soccer
Press box visit|🎙️|gameday_seat allsport
VIP parking|🚗|gameday_seat allsport
Meet-and-greet with players|🤝|gameday_seat allsport
Free refills all game|🥤|gameday_seat allsport
Tunnel high-fives|🙌|gameday_seat allsport
Pregame warmup access|🏃|gameday_seat allsport
Season tickets|🎫|gameday_seat allsport
Glass seats|🏒|gameday_seat hockey
Seats behind the goal|🥅|gameday_seat hockey soccer
Supporters' section|📣|gameday_seat soccer
Courtside seats|🏀|gameday_seat basketball
Seats behind the bench|🏀|gameday_seat basketball
Seats behind home plate|⚾|gameday_seat baseball
Dugout seats|⚾|gameday_seat baseball
Rooftop bleachers|⚾|gameday_seat baseball
50-yard-line seats|🏈|gameday_seat football
Sideline pass|🏈|gameday_seat football
# --- road trip: stops ---
Giant roadside dinosaur|🦖|roadtrip_stop
Retro diner|🥞|roadtrip_stop
Small-town pie shop|🥧|roadtrip_stop
BBQ joint|🍖|roadtrip_stop
Drive-in movie|🎬|roadtrip_stop
Roadside fruit stand|🍑|roadtrip_stop
Outlet mall|🛍️|roadtrip_stop
Mystery spot|🌀|roadtrip_stop
Ghost town|👻|roadtrip_stop
Giant ball of twine|🧶|roadtrip_stop
Alien-themed motel|👽|roadtrip_stop
Bigfoot museum|🦶|roadtrip_stop
Corn maze|🌽|roadtrip_stop
Pumpkin patch|🎃|roadtrip_stop
Apple orchard|🍎|roadtrip_stop
Truck-stop buffet|🍽️|roadtrip_stop
Neon-sign motel|🏨|roadtrip_stop
Mini golf stop|⛳|roadtrip_stop
Go-kart track|🏎️|roadtrip_stop
Small-town fair|🎡|roadtrip_stop
Rodeo|🤠|roadtrip_stop
Hidden donut shop|🍩|roadtrip_stop
Taco truck|🌮|roadtrip_stop
Vintage arcade|🕹️|roadtrip_stop
Roadside petting zoo|🐐|roadtrip_stop
Covered bridge|🌉|roadtrip_stop
Antique shop|🏺|roadtrip_stop
Fireworks stand|🎆|roadtrip_stop
Big-city skyline view|🌆|roadtrip_stop
Hot springs|♨️|roadtrip_stop nature
Scenic overlook|🏞️|roadtrip_stop nature
National park|🏞️|roadtrip_stop nature
Waterfall hike|💧|roadtrip_stop nature
Desert sunset|🌅|roadtrip_stop nature
Cave tour|🦇|roadtrip_stop nature
Canyon viewpoint|🏜️|roadtrip_stop nature
Sand dunes|🏜️|roadtrip_stop nature
Wildlife drive|🦌|roadtrip_stop nature
Swimming hole|🏊|roadtrip_stop nature
Mountain pass|🏔️|roadtrip_stop nature
Lakeside picnic|🧺|roadtrip_stop nature
Stargazing field|🌌|roadtrip_stop nature
Lighthouse tour|🌊|roadtrip_stop coastal
Beach boardwalk|🎡|roadtrip_stop coastal
Pier arcade|🎰|roadtrip_stop coastal
Seafood shack|🦞|roadtrip_stop coastal
Tide pools|🦀|roadtrip_stop coastal
Surf town|🏄|roadtrip_stop coastal
Cliffside pull-off|🌊|roadtrip_stop coastal
Sea lion beach|🦭|roadtrip_stop coastal
Ocean-view campsite|⛺|roadtrip_stop coastal
# --- road trip: gear ---
Epic road trip playlist|🎶|roadtrip_gear
Neck pillow|😴|roadtrip_gear
Polaroid camera|📸|roadtrip_gear festival_gear
Paper map|🗺️|roadtrip_gear
Car karaoke mic|🎤|roadtrip_gear
Phone mount|📱|roadtrip_gear
Bluetooth speaker|🔊|roadtrip_gear
Bikes on the rack|🚲|roadtrip_gear
Road trip bingo|🎲|roadtrip_gear
Spare tire|🛞|roadtrip_gear
Jumper cables|🔋|roadtrip_gear
Fuzzy dice|🎲|roadtrip_gear
Folding chairs|🪑|roadtrip_gear festival_gear
Card games|🃏|roadtrip_gear
Roof cargo box|📦|roadtrip_gear
Sunglasses|🕶️|roadtrip_gear festival_gear coastal
Beach towels|🏖️|roadtrip_gear coastal
Boogie board|🌊|roadtrip_gear coastal
Sunscreen|🧴|roadtrip_gear festival_gear coastal
Pop-up tent|⛺|roadtrip_gear festival_gear apocalypse_supply nature
Hiking boots|🥾|roadtrip_gear apocalypse_supply nature
Bug spray|🦟|roadtrip_gear nature
Camping stove|🔥|roadtrip_gear nature
# --- road trip: snacks ---
Beef jerky|🥩|roadtrip_snack
Trail mix|🥜|roadtrip_snack
Gummy bears|🐻|roadtrip_snack
Bag of chips|🥔|roadtrip_snack
Slushie|🥤|roadtrip_snack
Gas-station hot dog|🌭|roadtrip_snack
Bag of peaches|🍑|roadtrip_snack
Licorice ropes|🍬|roadtrip_snack
Donut holes|🍩|roadtrip_snack
Fruit snacks|🍬|roadtrip_snack
Pretzel bites|🥨|roadtrip_snack
Iced coffee|☕|roadtrip_snack
Cheese crackers|🧀|roadtrip_snack
Corn nuts|🌽|roadtrip_snack
Road trip sandwiches|🥪|roadtrip_snack
Granola bars|🌾|roadtrip_snack
Sour candy|🍭|roadtrip_snack
Cold soda|🥤|roadtrip_snack
Pork rinds|🐖|roadtrip_snack
# --- road trip: rides ---
Convertible|🚗|roadtrip_ride
Vintage camper van|🚐|roadtrip_ride
RV|🚐|roadtrip_ride
Pickup truck|🛻|roadtrip_ride
Muscle car|🏎️|roadtrip_ride
Electric SUV|🚙|roadtrip_ride
Jeep with no doors|🚙|roadtrip_ride
Motorcycle with sidecar|🏍️|roadtrip_ride
Tiny house on wheels|🏠|roadtrip_ride
Party bus|🚌|roadtrip_ride
Classic station wagon|🚗|roadtrip_ride
# --- festival: acts ---
Headliner DJ set|🎧|festival_act
Surprise reunion show|🎤|festival_act
Silent disco|🎧|festival_act
Fire dancers|🔥|festival_act
Drum circle|🥁|festival_act
Acoustic sunset set|🎸|festival_act
Pop superstar|🌟|festival_act
Indie band|🎸|festival_act
Hip-hop showcase|🎤|festival_act
Orchestra under the stars|🎻|festival_act
Mariachi band|🎺|festival_act
K-pop dance crew|💃|festival_act
Comedy tent|😂|festival_act
Stilt walkers|🤹|festival_act
Juggling troupe|🤹|festival_act
Laser show|✨|festival_act
Drone light show|🛸|festival_act
Fireworks finale|🎆|festival_act
Bubble artist|🫧|festival_act
Jazz brunch set|🎷|festival_act
Bluegrass jam|🪕|festival_act
EDM sunrise set|🌅|festival_act
Rock legend|🤘|festival_act
Choir flash mob|🎶|festival_act
Breakdance battle|🕺|festival_act
Puppet parade|🎭|festival_act
Steel drum band|🥁|festival_act
Magician|🎩|festival_act
Living statue|🗿|festival_act
# --- festival: gear ---
Glow sticks|🪄|festival_gear
Flower crown|🌸|festival_gear
Bucket hat|👒|festival_gear
Glitter face paint|✨|festival_gear
Fanny pack|👝|festival_gear
Light-up shoes|👟|festival_gear
Rain poncho|🌧️|festival_gear
Earplugs|👂|festival_gear
Totem flag|🚩|festival_gear
LED jacket|💡|festival_gear
Hydration pack|💧|festival_gear
Bandana|🧣|festival_gear
Inflatable flamingo|🦩|festival_gear
Cowboy hat|🤠|festival_gear
Light-up hula hoop|⭕|festival_gear
Bubble gun|🫧|festival_gear
Handheld fan|🌬️|festival_gear
Pull wagon|🛒|festival_gear
Glitter boots|👢|festival_gear
Portable phone charger|🔋|festival_gear
# --- festival: food ---
Funnel cake|🍰|festival_food
Fresh lemonade|🍋|festival_food
Wood-fired pizza|🍕|festival_food
Street tacos|🌮|festival_food
Shaved ice|🍧|festival_food
Bubble tea|🧋|festival_food
Gourmet grilled cheese|🥪|festival_food
Kettle corn|🍿|festival_food
Mini donuts|🍩|festival_food
Açaí bowl|🫐|festival_food
Dumplings|🥟|festival_food
Deep-fried cookies|🍪|festival_food
Kebabs|🍢|festival_food
Lobster roll|🦞|festival_food
Ice cream sandwich|🍦|festival_food
Loaded nachos|🧀|festival_food
Fried chicken sandwich|🍗|festival_food
# --- festival: perks ---
VIP pass|🎟️|festival_perk
Backstage pass|🎫|festival_perk
Front-row barricade spot|🙌|festival_perk
Flush toilets|🚽|festival_perk
Fast-lane entry|🏃|festival_perk
Artist meet-and-greet|🤝|festival_perk
Golf-cart rides|🛺|festival_perk
Shower trailer|🚿|festival_perk
Hammock lounge|🪢|festival_perk
Ferris wheel ride|🎡|festival_perk
Free merch|👕|festival_perk
Air-conditioned tent|❄️|festival_perk
Phone charging locker|🔌|festival_perk
Rooftop viewing deck|🌆|festival_perk
Sunrise yoga|🧘|festival_perk
# --- apocalypse: supplies ---
Canned beans|🥫|apocalypse_supply
Water filter|💧|apocalypse_supply
First aid kit|🩹|apocalypse_supply
Crank radio|📻|apocalypse_supply
Flashlight|🔦|apocalypse_supply
Solar charger|☀️|apocalypse_supply
Duct tape|🧰|apocalypse_supply
Multi-tool|🔧|apocalypse_supply
Rope|🪢|apocalypse_supply
Sleeping bag|🛌|apocalypse_supply
Seed vault|🌱|apocalypse_supply
Mountain bike|🚲|apocalypse_supply
Generator|⚡|apocalypse_supply
Gas mask|😷|apocalypse_supply
Walkie-talkies|📟|apocalypse_supply
Fire starter|🔥|apocalypse_supply
Compass|🧭|apocalypse_supply
Instant noodles|🍜|apocalypse_supply
Canned peaches|🍑|apocalypse_supply
Freeze-dried meals|🥘|apocalypse_supply
Rice sacks|🍚|apocalypse_supply
Chocolate stash|🍫|apocalypse_supply
Toilet paper hoard|🧻|apocalypse_supply
Board games|🎲|apocalypse_supply
Guitar|🎸|apocalypse_supply
Water barrels|🛢️|apocalypse_supply
Rooftop solar panels|🔆|apocalypse_supply
Rain collector|🌧️|apocalypse_supply
Batteries|🔋|apocalypse_supply
Map of hidden bunkers|🗺️|apocalypse_supply
Hazmat suit|🥼|apocalypse_supply
Night-vision goggles|🥽|apocalypse_supply
Fishing rod|🎣|apocalypse_supply
Sewing kit|🧵|apocalypse_supply
Coffee stockpile|☕|apocalypse_supply
Hand sanitizer|🧴|apocalypse_supply
Cast-iron pan|🍳|apocalypse_supply
Ham radio|📡|apocalypse_supply
Toolbox|🛠️|apocalypse_supply
Padded football armor|🏈|apocalypse_supply zombie
Chain-mail suit|⛓️|apocalypse_supply zombie
Noise-maker decoys|📢|apocalypse_supply zombie
Barricade boards|🪵|apocalypse_supply zombie
Tinfoil hat|🧢|apocalypse_supply alien
Satellite dish|📡|apocalypse_supply alien
UFO-proof umbrella|☂️|apocalypse_supply alien
Signal jammer|📶|apocalypse_supply alien
# --- apocalypse: skills ---
Green thumb|🌱|apocalypse_skill
First aid training|🩺|apocalypse_skill
Fire-starting|🔥|apocalypse_skill
Expert angler|🎣|apocalypse_skill
Engine repair|🔧|apocalypse_skill
Navigation|🧭|apocalypse_skill
Campfire cooking|🍲|apocalypse_skill
Archery|🏹|apocalypse_skill
Lockpicking|🔓|apocalypse_skill
Parkour|🏃|apocalypse_skill
Morse code|📡|apocalypse_skill
Foraging|🍄|apocalypse_skill
Carpentry|🪚|apocalypse_skill
Tailoring|🪡|apocalypse_skill
Animal whispering|🐾|apocalypse_skill
Leadership|📣|apocalypse_skill
Stealth|🥷|apocalypse_skill
Water purification|💧|apocalypse_skill
Beekeeping|🐝|apocalypse_skill
Staying calm|🧘|apocalypse_skill
Negotiation|🤝|apocalypse_skill
Driving stick shift|🚗|apocalypse_skill
Tree climbing|🌳|apocalypse_skill
Knot tying|🪢|apocalypse_skill
Building shelters|🛖|apocalypse_skill
Bartering|💰|apocalypse_skill
Keeping everyone laughing|😂|apocalypse_skill
Zombie disguise skills|🧟|apocalypse_skill zombie
Alien language decoding|👽|apocalypse_skill alien
Spaceship piloting|🚀|apocalypse_skill alien
# --- apocalypse: allies ---
Loyal dog|🐕|apocalypse_ally
Clever crow|🐦|apocalypse_ally
Pet goat|🐐|apocalypse_ally
Backyard chickens|🐔|apocalypse_ally
Retired army medic|🧑‍⚕️|apocalypse_ally
Genius kid inventor|🧒|apocalypse_ally
Grandma who's seen it all|👵|apocalypse_ally
Off-duty firefighter|🧑‍🚒|apocalypse_ally
Friendly robot|🤖|apocalypse_ally
Escaped zoo gorilla|🦍|apocalypse_ally
Carrier pigeon|🕊️|apocalypse_ally
Trusty horse|🐎|apocalypse_ally
Zombie expert professor|🧑‍🏫|apocalypse_ally zombie
Zombie that only wants hugs|🧟|apocalypse_ally zombie
Former astronaut|🧑‍🚀|apocalypse_ally alien
Alien defector|👽|apocalypse_ally alien
Conspiracy-theory neighbor|🛸|apocalypse_ally alien
# --- apocalypse: hideouts ---
Underground bunker|🕳️|apocalypse_base
Island lighthouse|🏝️|apocalypse_base
Abandoned castle|🏰|apocalypse_base
Treehouse fort|🌳|apocalypse_base
Mountain cabin|🏔️|apocalypse_base
Abandoned theme park|🎢|apocalypse_base
Empty cruise ship|🛳️|apocalypse_base
Fenced-in farm|🚜|apocalypse_base
Airship|🎈|apocalypse_base
Library fortress|📚|apocalypse_base
Mall after hours|🏬|apocalypse_base zombie
Prison fortress|🔒|apocalypse_base zombie
Warehouse store|🏪|apocalypse_base zombie
Deep cave network|🦇|apocalypse_base alien
`;

export type BankItem = { id: string; name: string; emoji: string; tags: readonly string[] };

/** Tags kept in the bank for future themes (not referenced by any recipe yet). */
export const RESERVED_TAGS: readonly string[] = [];

/** Stable id from a name: "Mac & cheese" -> "mac-cheese", "Cancún" -> "cancun". */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

let bank: BankItem[] | null = null;
let byId: Map<string, BankItem> | null = null;

/** The whole bank, parsed once on first use. */
export function getBank(): readonly BankItem[] {
  if (bank) return bank;
  const out: BankItem[] = [];
  for (const line of RAW.split("\n")) {
    const t = line.trim();
    if (!t || t[0] === "#") continue;
    const [name, emoji, tags] = t.split("|");
    out.push({ id: slugify(name), name: name.trim(), emoji: (emoji ?? "").trim(), tags: (tags ?? "").trim().split(/\s+/).filter(Boolean) });
  }
  bank = out;
  return bank;
}

export function getBankItem(id: string): BankItem | undefined {
  if (!byId) byId = new Map(getBank().map((it) => [it.id, it]));
  return byId.get(id);
}
