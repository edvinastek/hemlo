-- GetIt 005: shared catalogue (owner_id null = readable by every account)
insert into food (name,kcal,carbs_g,fiber_g,fat_g,protein_g) values
('Abiyuch',69.0,17.6,5.3,0.1,1.5),
('Acerola',32.0,7.69,1.1,0.3,0.4),
('Acorn',387.0,40.75,0.0,23.86,6.15),
('Acorn Dried',509.0,53.66,0.0,31.41,8.1),
('Almond',579.0,21.55,12.5,49.93,21.15),
('Almond Oil',884.0,0.0,0.0,100.0,0.0),
('Amaranth Leaves',23.0,4.02,0.0,0.33,2.46),
('Apple',52.0,13.81,2.4,0.17,0.26),
('Apple Crab',76.0,19.95,0.0,0.3,0.4),
('Apple Granny Smith',58.0,13.61,2.8,0.19,0.44),
('Apple Rose',25.0,5.7,0.0,0.3,0.6),
('Apricot',48.0,11.12,2.0,0.39,1.4),
('Apricot Dried',241.0,62.64,7.3,0.51,3.39),
('Apricot Kernel Oil',884.0,0.0,0.0,100.0,0.0),
('Arrowhead',99.0,20.23,0.0,0.29,5.33),
('Artichoke',47.0,10.51,5.4,0.15,3.27),
('Arugula',25.0,3.65,1.6,0.66,2.58),
('Asparagus',20.0,3.88,2.1,0.12,2.2),
('Avocado',160.0,8.53,6.7,14.66,2.0),
('Avocado Oil',884.0,0.0,0.0,100.0,0.0),
('Babassu Oil',884.0,0.0,0.0,100.0,0.0),
('Bacon Grease',897.0,0.0,0.0,99.5,0.0),
('Bamboo Shoots',27.0,5.2,2.2,0.3,2.6),
('Banana',89.0,22.84,2.6,0.33,1.09),
('Basil',23.0,2.65,1.6,0.64,3.15),
('Beechnut Dried',576.0,33.5,0.0,50.0,6.2),
('Beef Brain',143.0,1.05,0.0,10.3,10.86),
('Beef Brisket Flat Half',277.0,0.0,0.0,22.18,17.94),
('Beef Brisket Point Half',267.0,0.59,0.0,20.98,17.65),
('Beef Brisket Whole',253.0,0.56,0.0,19.06,18.42),
('Beef Carcass',291.0,0.0,0.0,24.05,17.32),
('Beef Chuck Arm Pot Roast',244.0,0.0,0.0,17.98,19.23),
('Beef Chuck Blade Roast',248.0,0.0,0.0,19.41,17.16),
('Beef Chuck Shoulder Clod, Shoulder Tender, Medallion',144.0,0.0,0.0,6.22,20.54),
('Beef Chuck Shoulder Clod, Shoulder Top, Center Steak',141.0,0.0,0.0,5.88,20.67),
('Beef Chuck Shoulder Clod, Top Blade, Steak',176.0,0.0,0.0,10.52,18.99),
('Beef Composite Of Trimmed Retail Cuts',215.0,0.0,0.0,14.42,20.01),
('Beef Cured Breakfast Strip',406.0,0.7,0.0,38.8,12.5),
('Beef Cured Corned Beef Brisket',198.0,0.14,0.0,14.9,14.68),
('Beef Flank Steak',155.0,0.0,0.0,7.17,21.22),
('Beef Ground Grass-fed',198.0,0.0,0.0,12.73,19.42),
('Beef Heart',112.0,0.14,0.0,3.94,17.72),
('Beef Kidney',99.0,0.29,0.0,3.09,17.4),
('Beef Liver',135.0,3.89,0.0,3.63,20.36),
('Beef Lungs',92.0,0.0,0.0,2.5,16.2),
('Beef Mechanically Separated',276.0,0.0,0.0,23.52,14.97),
('Beef Pancreas',235.0,0.0,0.0,18.6,15.7),
('Beef Rib Shortribs',390.0,0.4,0.0,36.23,14.4),
('Beef Rib Whole (Ribs 6-12)',306.0,0.0,0.0,26.1,16.53),
('Beef Rib, Eye, Small End (Ribs 10-12) Ribeye',274.0,0.0,0.0,22.07,17.51),
('Beef Rib, Large End (Ribs 6-9)',316.0,0.0,0.0,27.29,16.26),
('Beef Rib, Small End (Ribs 10-12) Prime Rib',254.0,0.0,0.0,19.06,19.33),
('Beef Round Bottom Steak',192.0,0.0,0.0,11.54,20.7),
('Beef Round Eye Roast',166.0,0.0,0.0,8.24,21.49),
('Beef Round Full Cut',195.0,0.0,0.0,11.92,20.56),
('Beef Round Knuckle, Tip Center, Steak',143.0,0.0,0.0,5.89,20.93),
('Beef Round Knuckle, Tip Side, Steak',129.0,0.0,0.0,4.0,21.69),
('Beef Round Outside, Bottom, Steak',142.0,0.0,0.0,5.53,21.59),
('Beef Round Tip',189.0,0.0,0.0,11.67,19.6),
('Beef Round Top Steak',166.0,0.0,0.0,7.93,22.06),
('Beef Short Loin, Porterhouse Steak',214.0,0.0,0.0,14.06,20.49),
('Beef Short Loin, T-Bone Steak',223.0,0.0,0.0,15.18,20.11),
('Beef Short Loin, Top Loin Steak',228.0,0.0,0.0,15.49,20.61),
('Beef Shoulder Top Blade Steak Boneless',146.0,0.0,0.0,7.25,20.16),
('Beef Sirloin Bottom Tri-tip Roast',165.0,0.0,0.0,8.55,20.64),
('Beef Sirloin Top',201.0,0.0,0.0,12.71,20.3),
('Beef Spleen',105.0,0.0,0.0,3.0,18.3),
('Beef Suet',854.0,0.0,0.0,94.0,1.5),
('Beef Tallow Fat',902.0,0.0,0.0,100.0,0.0),
('Beef Tenderloin Steak',247.0,0.0,0.0,18.16,19.61),
('Beef Thymus',236.0,0.0,0.0,20.35,12.18),
('Beef Tongue',224.0,3.68,0.0,16.09,14.9),
('Beef Tripe',85.0,0.0,0.0,3.69,12.07),
('Beet Greens',22.0,4.33,3.7,0.13,2.2),
('Beets',43.0,9.56,2.8,0.17,1.61),
('Bell Peppers',26.0,6.03,2.0,0.3,0.99),
('Bison Ground Grass-Fed',146.0,0.05,0.0,7.21,20.23),
('Bitter Gourd Leafy Tips',30.0,3.29,0.0,0.69,5.3),
('Bitter Gourd Pod',17.0,3.7,2.8,0.17,1.0),
('Blackberry',43.0,9.61,5.3,0.49,1.39),
('Blueberry',57.0,14.49,2.4,0.33,0.74),
('Bottle Gourd',14.0,3.39,0.5,0.02,0.62),
('Boysenberry',50.0,12.19,5.3,0.26,1.1),
('Brazil Nut Dried',659.0,11.74,7.5,67.1,14.32),
('Breadfruit',103.0,27.12,4.9,0.23,1.07),
('Breadfruit Seed',191.0,29.24,5.2,5.59,7.4),
('Breadnut Tree Seed Dried',367.0,79.39,14.9,1.68,8.62),
('Broccoli',34.0,6.64,2.6,0.37,2.82),
('Broccoli Leaves, Stalks, Flower Clusters',28.0,5.06,2.3,0.35,2.98),
('Brown Rice',110.0,22.78,1.8,0.89,2.56),
('Brussels Sprouts',43.0,8.95,3.8,0.3,3.38),
('Butter',717.0,0.06,0.0,81.11,0.85),
('Butter Almond',614.0,18.82,10.3,55.5,20.96),
('Butter Cashew',587.0,27.57,2.0,49.41,17.56),
('Butter Clarified',876.0,0.0,0.0,99.48,0.28),
('Butter Cocoa',884.0,0.0,0.0,100.0,0.0),
('Butter Nutmeg',884.0,0.0,0.0,100.0,0.0),
('Butter Oil',876.0,0.0,0.0,99.48,0.28),
('Butter Peanut Smooth',588.0,23.98,5.7,49.54,21.93),
('Butter Sesame Paste',586.0,24.05,5.5,50.87,18.08),
('Butter Sesame Tahini',595.0,21.19,9.3,53.76,17.0),
('Butter Sunflower',617.0,23.32,5.7,55.2,17.28),
('Butter Ucuhuba',884.0,0.0,0.0,100.0,0.0),
('Buttermilk',62.0,4.88,0.0,3.31,3.21),
('Cabbage',25.0,5.8,2.5,0.1,1.28),
('Cabbage Bok Choy',13.0,2.18,1.0,0.2,1.5),
('Cabbage Napa',16.0,3.23,1.2,0.2,1.2),
('Cabbage Red',31.0,7.37,2.1,0.16,1.43),
('Cabbage Savoy',27.0,6.1,3.1,0.1,2.0),
('Canola Oil',884.0,0.0,0.0,100.0,0.0),
('Capsicum Green',20.0,4.64,1.7,0.17,0.86),
('Capsicum Red',26.0,6.03,2.1,0.3,0.99),
('Capsicum Yellow',27.0,6.32,0.9,0.21,1.0),
('Carambola',31.0,6.73,2.8,0.33,1.04),
('Carrot',41.0,9.58,2.8,0.24,0.93),
('Carrot Baby',35.0,8.24,2.9,0.13,0.64),
('Cashew',553.0,30.19,3.3,43.85,18.22),
('Cauliflower',25.0,4.97,2.0,0.28,1.92),
('Cauliflower Green',31.0,6.09,3.2,0.3,2.95),
('Celery',14.0,2.97,1.6,0.17,0.69),
('Chard Swiss',19.0,3.74,1.6,0.2,1.8),
('Cheese Blue',353.0,2.34,0.0,28.74,21.4),
('Cheese Brick',371.0,2.79,0.0,29.68,23.24),
('Cheese Brie',334.0,0.45,0.0,27.68,20.75),
('Cheese Camembert',300.0,0.46,0.0,24.26,19.8),
('Cheese Caraway',376.0,3.06,0.0,29.2,25.18),
('Cheese Cheddar',403.0,3.37,0.0,33.31,22.87),
('Cheese Cheshire',387.0,4.78,0.0,30.6,23.37),
('Cheese Colby',394.0,2.57,0.0,32.11,23.76),
('Cheese Cottage Creamed',98.0,3.38,0.0,4.3,11.12),
('Cheese Cream',350.0,5.52,0.0,34.44,6.15),
('Cheese Edam',357.0,1.43,0.0,28.57,24.99),
('Cheese Feta',265.0,3.88,0.0,21.49,14.21),
('Cheese Fontina',389.0,1.55,0.0,31.14,25.6),
('Cheese Gjetost',373.0,0.68,0.0,30.28,24.48),
('Cheese Goat Hard',452.0,2.17,0.0,35.59,30.52),
('Cheese Goat Semisoft',364.0,0.12,0.0,29.84,21.58),
('Cheese Goat Soft',264.0,0.0,0.0,21.08,18.52),
('Cheese Gouda',356.0,2.22,0.0,27.44,24.94),
('Cheese Gruyere',413.0,0.36,0.0,32.34,29.81),
('Cheese Limburger',327.0,0.49,0.0,27.25,20.05),
('Cheese Mexican Anejo',373.0,4.63,0.0,29.98,21.44),
('Cheese Mexican Asadero',356.0,4.13,0.0,25.0,22.6),
('Cheese Mexican Chihuahua',374.0,5.56,0.0,29.68,21.56),
('Cheese Monterey',373.0,0.68,0.0,30.28,24.48),
('Cheese Mozzarella',299.0,2.4,0.0,22.14,22.17),
('Cheese Muenster',368.0,1.12,0.0,30.04,23.41),
('Cheese Neufchatel',253.0,3.59,0.0,22.78,9.15),
('Cheese Parmesan Hard',392.0,3.22,0.0,25.0,35.75),
('Cheese Port Salut',352.0,0.57,0.0,28.2,23.78),
('Cheese Provolone',351.0,2.14,0.0,26.62,25.58),
('Cheese Ricotta',150.0,7.27,0.0,10.18,7.54),
('Cheese Romano',387.0,3.63,0.0,26.94,31.8),
('Cheese Roquefort',369.0,2.0,0.0,30.64,21.54),
('Cheese Swiss',393.0,1.44,0.0,30.99,26.96),
('Cheese Tilsit',340.0,1.88,0.0,25.98,24.41),
('Cherry Sour',50.0,12.18,1.6,0.3,1.0),
('Cherry Sweet',63.0,16.01,2.1,0.2,1.06),
('Chestnut Chinese',224.0,49.07,0.0,1.11,4.2),
('Chestnut Chinese Dried',363.0,79.76,0.0,1.81,6.82),
('Chestnut European (with peel)',213.0,45.54,8.1,2.26,2.42),
('Chestnut European (without peel)',196.0,44.17,0.0,1.25,1.63),
('Chestnut European Dried (with peel)',374.0,77.31,11.7,4.45,6.39),
('Chestnut European Dried (without peel)',369.0,78.43,0.0,3.91,5.01),
('Chestnut Japanese',154.0,34.91,0.0,0.53,2.25),
('Chestnut Japanese Dried',360.0,81.43,0.0,1.24,5.25),
('Chia Seed',486.0,42.12,34.4,30.74,16.54),
('Chicken Broiler/Fryer Back Meat',137.0,0.0,0.0,5.92,19.56),
('Chicken Broiler/Fryer Back Meat+Skin',319.0,0.0,0.0,28.74,14.05),
('Chicken Broiler/Fryer Breast Meat',120.0,0.0,0.0,2.62,22.5),
('Chicken Broiler/Fryer Breast Meat+Skin',172.0,0.0,0.0,9.25,20.85),
('Chicken Broiler/Fryer Dark-Meat Drumstick Meat',116.0,0.0,0.0,3.71,19.41),
('Chicken Broiler/Fryer Dark-Meat Meat',125.0,0.0,0.0,4.31,20.08),
('Chicken Broiler/Fryer Dark-Meat Meat+Skin',237.0,0.0,0.0,18.34,16.69),
('Chicken Broiler/Fryer Dark-Meat Thigh Meat',121.0,0.0,0.0,4.12,19.66),
('Chicken Broiler/Fryer Drumstick Meat+Skin',161.0,0.11,0.0,9.2,18.08),
('Chicken Broiler/Fryer Giblets',124.0,1.8,0.0,4.47,17.88),
('Chicken Broiler/Fryer Leg Meat',120.0,0.0,0.0,4.22,19.16),
('Chicken Broiler/Fryer Leg Meat+Skin',214.0,0.17,0.0,15.95,16.37),
('Chicken Broiler/Fryer Light-Meat Meat',114.0,0.0,0.0,1.65,23.2),
('Chicken Broiler/Fryer Light-Meat Meat+Skin',186.0,0.0,0.0,11.07,20.27),
('Chicken Broiler/Fryer Meat',119.0,0.0,0.0,3.08,21.39),
('Chicken Broiler/Fryer Meat+Skin',215.0,0.0,0.0,15.06,18.6),
('Chicken Broiler/Fryer Meat+Skin+Giblets+Neck',213.0,0.13,0.0,14.83,18.33),
('Chicken Broiler/Fryer Neck Meat',154.0,0.0,0.0,8.78,17.55),
('Chicken Broiler/Fryer Neck Meat+Skin',297.0,0.0,0.0,26.24,14.07),
('Chicken Broiler/Fryer Separable Fat',629.0,0.0,0.0,67.95,3.73),
('Chicken Broiler/Fryer Skin',349.0,0.0,0.0,32.35,13.33),
('Chicken Broiler/Fryer Thigh Meat+Skin',221.0,0.25,0.0,16.61,16.52),
('Chicken Broiler/Fryer Wing Meat',126.0,0.0,0.0,3.54,21.97),
('Chicken Broiler/Fryer Wing Meat+Skin',191.0,0.0,0.0,12.85,17.52),
('Chicken Capons Giblets',130.0,1.42,0.0,5.18,18.28),
('Chicken Capons Meat+Skin',234.0,0.0,0.0,17.07,18.77),
('Chicken Capons Meat+Skin+Giblets+Neck',232.0,0.08,0.0,16.9,18.51),
('Chicken Cornish Game Hens Meat',116.0,0.0,0.0,3.33,20.04),
('Chicken Cornish Game Hens Meat+Skin',200.0,0.0,0.0,14.02,17.15),
('Chicken Fat',900.0,0.0,0.0,null,0.0),
('Chicken Gizzard',94.0,0.0,0.0,2.06,17.66),
('Chicken Ground',143.0,0.04,0.0,8.1,17.44),
('Chicken Heart',153.0,0.71,0.0,9.33,15.55),
('Chicken Liver',119.0,0.73,0.0,4.83,16.92),
('Chicken Roasting Dark-Meat Meat',113.0,0.0,0.0,3.61,18.74),
('Chicken Roasting Giblets',127.0,1.14,0.0,5.04,18.14),
('Chicken Roasting Light-Meat Meat',109.0,0.0,0.0,1.63,22.2),
('Chicken Roasting Meat',111.0,0.0,0.0,2.7,20.33),
('Chicken Roasting Meat+Skin+Giblets+Neck',213.0,0.09,0.0,15.46,17.09),
('Chicken Stewing Dark-Meat Meat',157.0,0.0,0.0,8.12,19.7),
('Chicken Stewing Giblets',168.0,2.13,0.0,9.21,17.89),
('Chicken Stewing Light-Meat Meat',137.0,0.0,0.0,4.21,23.1),
('Chicken Stewing Meat',148.0,0.0,0.0,6.32,21.26),
('Chicken Stewing Meat+Skin',258.0,0.0,0.0,20.33,17.55),
('Chicken Stewing Meat+Skin+Giblets+Neck',251.0,0.19,0.0,19.52,17.48),
('Chickpeas',210.0,34.0,7.0,3.0,11.0),
('Chilli Green',40.0,9.46,1.5,0.2,2.0),
('Chilli Red',40.0,8.81,1.5,0.44,1.87),
('Chives',30.0,4.35,2.5,0.73,3.27),
('Chrysanthemum Garland',24.0,3.02,3.0,0.56,3.36),
('Chrysanthemum Leaves',24.0,3.01,3.0,0.56,3.36),
('Clementine',47.0,12.02,1.7,0.15,0.85),
('Coconut Meat',354.0,15.23,9.0,33.49,3.33),
('Coconut Meat Dried',660.0,23.65,16.3,64.53,6.88),
('Coconut Oil',892.0,0.0,0.0,100.0,0.0),
('Coconut Water',19.0,3.71,1.1,0.2,0.72),
('Collard',32.0,5.42,4.0,0.61,3.02),
('Coriander',23.0,3.67,2.8,0.52,2.13),
('Corn Oil',900.0,0.0,0.0,100.0,0.0),
('Corn White',86.0,19.02,2.7,1.18,3.22),
('Corn Yellow',86.0,18.7,2.0,1.35,3.27),
('Cottage Cheese',103.0,2.68,0.0,4.51,12.49),
('Cottage Cheese (Low Fat, 1% Milkfat, Lactose Reduced)',74.0,3.2,0.6,1.0,12.4),
('Cottonseed Oil',884.0,0.0,0.0,100.0,0.0),
('Cowpea (pods + seeds)',44.0,9.5,3.3,0.3,3.3),
('Cowpea Leafy Tips',29.0,4.82,0.0,0.25,4.1),
('Cowpea Seeds (immature)',90.0,18.83,5.0,0.35,2.95),
('Crab Alaska King',84.0,0.0,0.0,0.6,18.29),
('Crab Blue',87.0,0.04,0.0,1.08,18.06),
('Crab Dungeness',86.0,0.74,0.0,0.97,17.41),
('Crab Queen',90.0,0.0,0.0,1.18,18.5),
('Cranberry',46.0,11.97,3.6,0.13,0.46),
('Crayfish Mixed Farmed',72.0,0.0,0.0,0.97,14.85),
('Crayfish Mixed Wild',77.0,0.0,0.0,0.95,15.97),
('Cream Half and Half',131.0,4.3,0.0,11.5,3.13),
('Cream Heavy Whipping',340.0,2.84,0.0,36.08,2.84),
('Cream Light',195.0,3.66,0.0,19.1,2.96),
('Cream Light Whipping',292.0,2.96,0.0,30.91,2.17),
('Cream Sour',198.0,4.63,0.0,19.35,2.44),
('Cucumber (with peel)',15.0,3.63,0.5,0.11,0.65),
('Cucumber (without peel)',10.0,2.16,0.7,0.16,0.59),
('Cupu Assu Oil',884.0,0.0,0.0,100.0,0.0),
('Currant Black',63.0,15.38,0.0,0.41,1.4),
('Currant Red, White',56.0,13.8,4.3,0.2,1.4),
('Custard Apple',101.0,25.2,2.4,0.6,1.7),
('Custard Apple Cherimoya',75.0,17.71,3.0,0.68,1.57),
('Dandelion Greens',45.0,9.2,3.5,0.7,2.7),
('Dates Deglet Noor',282.0,75.03,8.0,0.39,2.45),
('Dates Medjool',277.0,74.97,6.7,0.15,1.81),
('Dill Leaves',43.0,7.02,2.1,1.12,3.46),
('Duck Domesticated Liver',136.0,3.53,0.0,4.64,18.74),
('Duck Domesticated Meat',135.0,0.94,0.0,5.95,18.28),
('Duck Domesticated Meat+Skin',404.0,0.0,0.0,39.34,11.49),
('Duck Fat',882.0,0.0,0.0,99.8,0.0),
('Duck Wild Breast Meat',123.0,0.0,0.0,4.25,19.85),
('Duck Wild Meat+Skin',211.0,0.0,0.0,15.2,17.42),
('Durian',147.0,27.09,3.8,5.33,1.47),
('Edamame',109.0,7.61,4.8,4.73,11.22),
('Egg Chicken',143.0,0.72,0.0,9.51,12.56),
('Egg Duck',185.0,1.45,0.0,13.77,12.81),
('Egg Goose',185.0,1.35,0.0,13.27,13.87),
('Egg Quail',158.0,0.41,0.0,11.09,13.05),
('Egg Turkey',171.0,1.15,0.0,11.88,13.68),
('Eggplant',25.0,5.88,3.0,0.18,0.98),
('Elderberry',73.0,18.4,7.0,0.5,0.66),
('Emu Drum Inside',108.0,0.0,0.0,1.49,22.22),
('Emu Drum Outside',103.0,0.0,0.0,0.48,23.08),
('Emu Fan Fillet',103.0,0.0,0.0,0.8,22.5),
('Emu Flat Fillet',102.0,0.0,0.0,0.74,22.25),
('Emu Full Rump',112.0,0.0,0.0,1.64,22.83),
('Emu Ground',134.0,0.0,0.0,4.03,22.77),
('Emu Oyster',141.0,0.0,0.0,4.86,22.81),
('Endive',17.0,3.35,3.1,0.2,1.25),
('ENOVA Oil 80% DAG',884.0,0.0,0.0,100.0,0.0),
('Fava Beans (pods + seeds)',88.0,17.63,7.5,0.73,7.92),
('Feijoa',61.0,15.21,6.4,0.42,0.71),
('Fenugreek Leaves',43.0,7.1,3.6,0.75,4.82),
('Fig',74.0,19.18,2.9,0.3,0.75),
('Fish Anchovy European',131.0,0.0,0.0,4.84,20.35),
('Fish Bass Fresh Water Mixed',114.0,0.0,0.0,3.69,18.86),
('Fish Bass Sea Mixed',97.0,0.0,0.0,2.0,18.43),
('Fish Bass Striped',97.0,0.0,0.0,2.33,17.73),
('Fish Bluefish',124.0,0.0,0.0,4.24,20.04),
('Fish Burbot',90.0,0.0,0.0,0.81,19.31),
('Fish Butterfish',146.0,0.0,0.0,8.02,17.28),
('Fish Carp',127.0,0.0,0.0,5.6,17.83),
('Fish Catfish Channel Farmed',119.0,0.0,0.0,5.94,15.23),
('Fish Catfish Channel Wild',95.0,0.0,0.0,2.82,16.38),
('Fish Cisco',98.0,0.0,0.0,1.91,18.99),
('Fish Cod Atlantic',82.0,0.0,0.0,0.67,17.81),
('Fish Cod Pacific',69.0,0.0,0.0,0.41,15.27),
('Fish Croaker Atlantic',104.0,0.0,0.0,3.17,17.78),
('Fish Cusk',87.0,0.0,0.0,0.69,18.99),
('Fish Drum Freshwater',119.0,0.0,0.0,4.93,17.54),
('Fish Eel Mixed',184.0,0.0,0.0,11.66,18.44),
('Fish Flatfish Flounder/Sole',70.0,0.0,0.0,1.93,12.41),
('Fish Grouper Mixed',92.0,0.0,0.0,1.02,19.38),
('Fish Haddock',74.0,0.0,0.0,0.45,16.32),
('Fish Halibut Atlantic/Pacific',91.0,0.0,0.0,1.33,18.56),
('Fish Halibut Greenland',186.0,0.0,0.0,13.84,14.37),
('Fish Herring Atlantic',158.0,0.0,0.0,9.04,17.96),
('Fish Herring Pacific',195.0,0.0,0.0,13.88,16.39),
('Fish Ling',87.0,0.0,0.0,0.64,18.99),
('Fish Lingcod',85.0,0.0,0.0,1.06,17.66),
('Fish Mackerel Atlantic',205.0,0.0,0.0,13.89,18.6),
('Fish Mackerel King',105.0,0.0,0.0,2.0,20.28),
('Fish Mackerel Pacific and Jack Mixed',158.0,0.0,0.0,7.89,20.07),
('Fish Mackerel Spanish',139.0,0.0,0.0,6.3,19.29),
('Fish Mahimahi',85.0,0.0,0.0,0.7,18.5),
('Fish Milkfish',148.0,0.0,0.0,6.73,20.53),
('Fish Monkfish',76.0,0.0,0.0,1.52,14.48),
('Fish Mullet Striped',117.0,0.0,0.0,3.79,19.35),
('Fish Ocean Perch Atlantic',79.0,0.0,0.0,1.54,15.31),
('Fish Oil Cod Liver',902.0,0.0,0.0,100.0,0.0),
('Fish Oil Herring',902.0,0.0,0.0,100.0,0.0),
('Fish Oil Menhaden',902.0,0.0,0.0,100.0,0.0),
('Fish Oil Salmon',902.0,0.0,0.0,100.0,0.0),
('Fish Oil Sardine',902.0,0.0,0.0,100.0,0.0),
('Fish Paste',99.0,6.85,0.0,0.9,15.18),
('Fish Perch Mixed',91.0,0.0,0.0,0.92,19.39),
('Fish Pike Northern',88.0,0.0,0.0,0.69,19.26),
('Fish Pike Walleye',93.0,0.0,0.0,1.22,19.14),
('Fish Pollock Alaska',76.0,0.0,0.0,0.82,17.17),
('Fish Pollock Atlantic',92.0,0.0,0.0,0.98,19.44),
('Fish Pompano Florida',164.0,0.0,0.0,9.47,18.48),
('Fish Pout Ocean',79.0,0.0,0.0,0.91,16.64),
('Fish Rockfish Pacific Mixed',90.0,0.0,0.0,1.34,18.36),
('Fish Roe Mixed',143.0,1.5,0.0,6.42,22.32),
('Fish Roughy Orange',76.0,0.0,0.0,0.7,16.41),
('Fish Sablefish',195.0,0.0,0.0,15.3,13.41),
('Fish Salmon Atlantic Farmed',208.0,0.0,0.0,13.42,20.42),
('Fish Salmon Atlantic Wild',142.0,0.0,0.0,6.34,19.84),
('Fish Salmon Chinook',179.0,0.0,0.0,10.43,19.93),
('Fish Salmon Chum',120.0,0.0,0.0,3.77,20.14),
('Fish Salmon Coho Farmed',160.0,0.0,0.0,7.67,21.27),
('Fish Salmon Coho Wild',146.0,0.0,0.0,5.93,21.62),
('Fish Salmon Pink',127.0,0.0,0.0,4.4,20.5),
('Fish Salmon Sockeye',131.0,0.0,0.0,4.69,22.25),
('Fish Scup',105.0,0.0,0.0,2.73,18.88),
('Fish Seatrout Mixed',104.0,0.0,0.0,3.61,16.74),
('Fish Shad American',197.0,0.0,0.0,13.77,16.93),
('Fish Shark Mixed',130.0,0.0,0.0,4.51,20.98),
('Fish Sheepshead',108.0,0.0,0.0,2.41,20.21),
('Fish Smelt Rainbow',97.0,0.0,0.0,2.42,17.63),
('Fish Snapper Mixed',100.0,0.0,0.0,1.34,20.51),
('Fish Spot',123.0,0.0,0.0,4.9,18.51),
('Fish Sturgeon Mixed',105.0,0.0,0.0,4.04,16.14),
('Fish Sucker White',92.0,0.0,0.0,2.32,16.76),
('Fish Sunfish Pumpkin Seed',89.0,0.0,0.0,0.7,19.4),
('Fish Swordfish',144.0,0.0,0.0,6.65,19.66),
('Fish Tilapia',96.0,0.0,0.0,1.7,20.08),
('Fish Tilefish',96.0,0.0,0.0,2.31,17.5),
('Fish Trout Mixed',148.0,0.0,0.0,6.61,20.77),
('Fish Trout Rainbow Farmed',141.0,0.0,0.0,6.18,19.94),
('Fish Trout Rainbow Wild',119.0,0.0,0.0,3.46,20.48),
('Fish Tuna Bluefin',144.0,0.0,0.0,4.9,23.33),
('Fish Tuna Skipjack',103.0,0.0,0.0,1.01,22.0),
('Fish Tuna Yellowfin',109.0,0.0,0.0,0.49,24.4),
('Fish Turbot European',95.0,0.0,0.0,2.95,16.05),
('Fish Whitefish Mixed',134.0,0.0,0.0,5.86,19.09),
('Fish Whiting Mixed',90.0,0.0,0.0,1.31,18.31),
('Fish Wolfish Atlantic',96.0,0.0,0.0,2.39,17.5),
('Fish Yellowtail Mixed',146.0,0.0,0.0,5.24,23.14),
('Flaxseed',534.0,28.88,27.3,42.16,18.29),
('Flaxseed Oil',884.0,0.0,0.0,100.0,0.0),
('French Beans Green',31.0,6.97,2.7,0.22,1.83),
('French Beans Yellow',31.0,7.13,3.4,0.12,1.82),
('Frog Legs',73.0,0.0,0.0,0.3,16.4),
('Game Meat Antelope',114.0,0.0,0.0,2.03,22.38),
('Game Meat Bear',161.0,0.0,0.0,8.3,20.1),
('Game Meat Beaver',146.0,0.0,0.0,4.8,24.05),
('Game Meat Beefalo',143.0,0.0,0.0,4.8,23.3),
('Game Meat Bison Ground',223.0,0.0,0.0,15.93,18.67),
('Game Meat Boar',122.0,0.0,0.0,3.33,21.51),
('Game Meat Caribou',127.0,0.0,0.0,3.36,22.63),
('Game Meat Deer',120.0,0.0,0.0,2.42,22.96),
('Game Meat Deer Ground',157.0,0.0,0.0,7.13,21.78),
('Game Meat Elk',111.0,0.0,0.0,1.45,22.95),
('Game Meat Elk Ground',172.0,0.0,0.0,8.82,21.76),
('Game Meat Goat',109.0,0.0,0.0,2.31,20.6),
('Game Meat Horse',133.0,0.0,0.0,4.6,21.39),
('Game Meat Moose',102.0,0.0,0.0,0.74,22.24),
('Game Meat Muskrat',162.0,0.0,0.0,8.1,20.76),
('Game Meat Rabbit Domesticated',136.0,0.0,0.0,5.55,20.05),
('Game Meat Rabbit Wild',114.0,0.0,0.0,2.32,21.79),
('Game Meat Squirrel',120.0,0.0,0.0,3.21,21.23),
('Game Meat Water Buffalo',99.0,0.0,0.0,1.37,20.39),
('Garlic',149.0,33.06,2.1,0.5,6.36),
('Ginger',80.0,17.77,2.0,0.75,1.82),
('Ginkgo Nut Dried',348.0,72.45,0.0,2.0,10.35),
('Goose Domesticated Meat',161.0,0.0,0.0,7.13,22.75),
('Goose Domesticated Meat+Skin',371.0,0.0,0.0,33.62,15.86),
('Goose Fat',900.0,0.0,0.0,99.8,0.0),
('Goose Liver',133.0,6.32,0.0,4.28,16.37),
('Gooseberry',44.0,10.18,4.3,0.58,0.88),
('Grape Leaves',93.0,17.31,11.0,2.12,5.6),
('Grapefruit Pink, Red, White',32.0,8.08,1.1,0.1,0.63),
('Grapes American Type',67.0,17.15,0.9,0.35,0.63),
('Grapes European Type',69.0,18.1,0.9,0.16,0.72),
('Grapes Muscadine',57.0,13.93,3.9,0.47,0.81),
('Grapeseed Oil',884.0,0.0,0.0,0.0,0.0),
('Guava',68.0,14.32,5.4,0.95,2.55),
('Guava Strawberry',69.0,17.36,5.4,0.6,0.58),
('Guinea Hen Meat',110.0,0.0,0.0,2.47,20.64),
('Guinea Hen Meat+Skin',158.0,0.0,0.0,6.45,23.4),
('Hazelnut Filbert',628.0,16.7,9.7,60.75,14.95),
('Hazelnut Oil',884.0,0.0,0.0,100.0,0.0),
('Hempseed',553.0,8.67,4.0,48.75,31.56),
('Hickorynut',657.0,18.25,6.4,64.37,12.72),
('Hyacinth Bean Seeds (immature)',46.0,9.19,3.3,0.2,2.1),
('Ivy Gourd',18.0,3.1,1.6,0.1,1.2),
('Jackfruit',95.0,23.25,1.5,0.64,1.72),
('Jalapeno',29.0,6.5,2.8,0.37,0.91),
('Jujube',79.0,20.23,0.0,0.2,1.2),
('Kale',35.0,4.42,4.1,1.49,2.92),
('Kale Chinese',26.0,4.67,2.6,0.76,1.2),
('Kefir',52.0,7.34,0.0,0.92,3.59),
('Kiwifruit',61.0,14.66,3.0,0.52,1.14),
('Kohlrabi',27.0,6.2,3.6,0.1,1.7),
('Kumquat',71.0,15.9,6.5,0.86,1.88),
('Lamb Brain',122.0,0.0,0.0,8.58,10.4),
('Lamb Composite of Trimmed Retail Cuts',267.0,0.0,0.0,21.59,16.88),
('Lamb Foreshank',201.0,0.0,0.0,13.38,18.91),
('Lamb Ground',282.0,0.0,0.0,23.41,16.56),
('Lamb Heart',122.0,0.21,0.0,5.68,16.47),
('Lamb Kidney',97.0,0.82,0.0,2.95,15.74),
('Lamb Leg Shank Half',201.0,0.0,0.0,13.49,18.58),
('Lamb Leg Sirloin Half',272.0,0.0,0.0,22.11,16.94),
('Lamb Leg Whole',230.0,0.0,0.0,17.07,17.91),
('Lamb Liver',139.0,1.78,0.0,5.02,20.38),
('Lamb Loin',310.0,0.0,0.0,26.63,16.32),
('Lamb Lungs',95.0,0.0,0.0,2.6,16.7),
('Lamb Mechanically Separated',276.0,0.0,0.0,23.54,14.97),
('Lamb Pancreas',152.0,0.0,0.0,9.82,14.84),
('Lamb Rib',372.0,0.0,0.0,34.39,14.52),
('Lamb Shoulder Arm',260.0,0.0,0.0,20.9,16.79),
('Lamb Shoulder Blade',259.0,0.0,0.0,20.86,16.63),
('Lamb Shoulder Whole',264.0,0.0,0.0,21.45,16.58),
('Lamb Spleen',101.0,0.0,0.0,3.1,17.2),
('Lamb Tongue',222.0,0.0,0.0,17.17,15.7),
('Lambsquarters',43.0,7.3,4.0,0.8,4.2),
('Lard',902.0,0.0,0.0,100.0,0.0),
('Leeks',61.0,14.15,1.8,0.3,1.5),
('Lemon Grass',99.0,25.31,0.0,0.49,1.82),
('Lemon Juice',22.0,6.9,0.3,0.24,0.35),
('Lemon Peel',47.0,16.0,10.6,0.3,1.5),
('Lentils',353.0,60.08,30.5,1.06,25.8),
('Lettuce Butterhead',13.0,2.23,1.1,0.22,1.35),
('Lettuce Cos/Romaine',17.0,3.29,2.1,0.3,1.23),
('Lettuce Green Leaf',15.0,2.87,1.3,0.15,1.36),
('Lettuce Iceberg',15.0,2.87,1.3,0.15,1.36),
('Lettuce Red Leaf',13.0,2.26,0.9,0.22,1.33),
('Lima Bean Seeds (immature)',113.0,20.17,4.9,0.86,6.84),
('Lime',30.0,10.54,2.8,0.2,0.7),
('Lime Juice',25.0,8.42,0.4,0.07,0.42),
('Litchi',66.0,16.53,1.3,0.44,0.83),
('Lobster Northern',77.0,0.0,0.0,0.75,16.52),
('Lobster Spiny Mixed',112.0,2.43,0.0,1.51,20.6),
('Loganberry',55.0,13.02,5.3,0.31,1.52),
('Longan',60.0,15.14,1.1,0.1,1.31),
('Loquat',47.0,12.14,1.7,0.2,0.43),
('Lotus Root',74.0,17.23,4.9,0.1,2.6),
('Lotus Seed',89.0,17.28,0.0,0.53,4.13),
('Lotus Seed Dried',332.0,64.47,0.0,1.97,15.41),
('Macadamia Nut',718.0,13.82,8.6,75.77,7.91),
('Mamey Apple',51.0,12.5,3.0,0.5,0.5),
('Mango',60.0,14.98,1.6,0.38,0.82),
('Melon Cantaloupe',34.0,8.16,0.9,0.19,0.84),
('Melon Casaba',28.0,6.58,0.9,0.1,1.11),
('Melon Honeydew',36.0,9.09,0.8,0.14,0.54),
('Milk Almond',15.0,0.58,0.0,1.1,0.59),
('Milk Coconut',230.0,5.54,2.2,23.84,2.29),
('Milk Cow',61.0,4.8,0.0,3.25,3.15),
('Milk Cow Lactose Free',61.0,4.8,0.0,3.25,3.15),
('Milk Goat',69.0,4.45,0.0,4.14,3.56),
('Milk Human',70.0,6.89,0.0,4.38,1.03),
('Milk Indian Buffalo',97.0,5.18,0.0,6.89,3.75),
('Milk Rice',47.0,9.17,0.3,0.97,0.28),
('Milk Sheep',108.0,5.36,0.0,7.0,5.98),
('Milk Soy',43.0,4.92,0.2,1.47,2.6),
('Mollusk Abalone Mixed',105.0,6.01,0.0,0.76,17.1),
('Mollusk Clam Mixed',86.0,3.57,0.0,0.96,14.67),
('Mollusk Cuttlefish Mixed',79.0,0.82,0.0,0.7,16.24),
('Mollusk Mussel Blue',86.0,3.69,0.0,2.24,11.9),
('Mollusk Octopus',82.0,2.2,0.0,1.04,14.91),
('Mollusk Oyster Eastern Farmed',59.0,5.53,0.0,1.55,5.22),
('Mollusk Oyster Eastern Wild',51.0,2.72,0.0,1.71,5.71),
('Mollusk Oyster Pacific',81.0,4.95,0.0,2.3,9.45),
('Mollusk Scallop Mixed',69.0,3.18,0.0,0.49,12.06),
('Mollusk Snail',90.0,2.0,0.0,1.4,16.1),
('Mollusk Squid Mixed',92.0,3.08,0.0,1.38,15.58),
('Mollusk Whelk',137.0,7.76,0.0,0.4,23.84),
('Moringa Leaves',64.0,8.28,2.0,1.4,9.4),
('Moringa Pods',37.0,8.53,3.2,0.2,2.1),
('Mulberry',43.0,9.8,1.7,0.39,1.44),
('Mushroom Chanterelle',32.0,6.86,3.8,0.53,1.49),
('Mushroom Cremini/Italian',22.0,4.3,0.6,0.1,2.5),
('Mushroom Enoki',37.0,7.81,2.7,0.29,2.66),
('Mushroom Maitake',31.0,6.97,2.7,0.19,1.94),
('Mushroom Morel',31.0,5.1,2.8,0.57,3.12),
('Mushroom Oyster',33.0,6.09,2.3,0.41,3.31),
('Mushroom Portobello',22.0,3.87,1.3,0.35,2.11),
('Mushroom Shiitake',34.0,6.79,2.5,0.49,2.24),
('Mushroom White',22.0,3.26,1.0,0.34,3.09),
('Mustard Greens',27.0,4.67,3.2,0.42,2.86),
('Mustard Oil',884.0,0.0,0.0,100.0,0.0),
('Mustard Spinach',22.0,3.9,2.8,0.3,2.2),
('Oat Oil',884.0,0.0,0.0,100.0,0.0),
('Oats',389.0,66.27,10.6,6.9,16.89),
('Oheloberry',28.0,6.84,0.0,0.22,0.38),
('Okra',33.0,7.45,3.2,0.19,1.93),
('Olive Black',105.0,6.06,3.0,9.54,0.88),
('Olive Green',145.0,3.84,3.3,15.32,1.03),
('Olive Oil',884.0,0.0,0.0,100.0,0.0),
('Onion',40.0,9.34,1.7,0.1,1.1),
('Onion Shallot',72.0,16.8,3.2,0.1,2.5),
('Onion Spring',32.0,7.34,2.6,0.19,1.83),
('Onion Sweet',32.0,7.55,0.9,0.08,0.8),
('Onion Welsh',34.0,6.5,2.4,0.4,1.9),
('Opuntia',41.0,9.57,3.6,0.51,0.73),
('Orange',47.0,11.75,2.4,0.12,0.94),
('Orange Navel',49.0,12.54,2.2,0.15,0.91),
('Orange Peel',97.0,25.0,10.6,0.2,1.5),
('Orange Tangerine',53.0,13.34,1.8,0.31,0.81),
('Ostrich Fan',117.0,0.0,0.0,2.65,21.81),
('Ostrich Ground',165.0,0.0,0.0,8.7,20.22),
('Ostrich Leg Inside',111.0,0.0,0.0,1.72,22.39),
('Ostrich Leg Outside',115.0,0.0,0.0,1.96,22.86),
('Ostrich Oyster',125.0,0.0,0.0,3.67,21.55),
('Ostrich Round',116.0,0.0,0.0,2.4,21.99),
('Ostrich Strip Inside',127.0,0.0,0.0,2.87,23.69),
('Ostrich Strip Outside',120.0,0.0,0.0,2.21,23.36),
('Ostrich Tenderloin',123.0,0.0,0.0,3.19,22.07),
('Ostrich Tip Trimmed',114.0,0.0,0.0,2.3,21.85),
('Ostrich Top Loin',119.0,0.0,0.0,2.95,21.67),
('Palm Kernel Oil',862.0,0.0,0.0,100.0,0.0),
('Palm Oil',884.0,0.0,0.0,100.0,0.0),
('Papaya',43.0,10.82,1.7,0.26,0.47),
('Parsley',36.0,6.33,3.3,0.79,2.97),
('Parsnip',75.0,17.99,4.9,0.3,1.2),
('Passion Fruit Purple',97.0,23.38,10.4,0.7,2.2),
('Pea',81.0,14.45,5.7,0.4,5.42),
('Pea Edible-Podded',42.0,7.55,2.6,0.2,2.8),
('Peach Nectarine',44.0,10.55,1.7,0.32,1.06),
('Peach Yellow',39.0,9.54,1.5,0.25,0.91),
('Peanut',567.0,16.13,8.5,49.24,25.8),
('Peanut Oil',884.0,0.0,0.0,100.0,0.0),
('Peanut Spanish',570.0,15.83,9.5,49.6,26.15),
('Peanut Valencia',570.0,20.91,8.7,47.58,25.09),
('Peanut Virginia',563.0,16.54,8.5,48.75,25.19),
('Pear',57.0,15.23,3.1,0.14,0.36),
('Pear Asian',42.0,10.65,3.6,0.23,0.5),
('Pear Bartlett',63.0,15.01,3.1,0.16,0.39),
('Pear Bosc',67.0,16.1,3.1,0.09,0.36),
('Pear Green Anjou',66.0,15.79,3.1,0.1,0.44),
('Pear Red Anjou',62.0,14.94,3.0,0.14,0.33),
('Pecan',691.0,13.86,9.6,71.97,9.17),
('Pepper Banana',27.0,5.35,3.4,0.45,1.66),
('Pepper Hungarian',29.0,6.7,1.0,0.41,0.8),
('Pepper Serrano',32.0,6.7,3.7,0.44,1.74),
('Persimmon',70.0,18.59,3.6,0.19,0.58),
('Pheasant Breast Meat',133.0,0.0,0.0,3.25,24.37),
('Pheasant Leg Meat',134.0,0.0,0.0,4.3,22.2),
('Pheasant Meat',133.0,0.0,0.0,3.64,23.57),
('Pheasant Meat+Skin',181.0,0.0,0.0,9.29,22.7),
('Physalis',53.0,11.2,0.0,0.7,1.9),
('Pilinut',719.0,3.98,0.0,79.55,10.8),
('Pine Nut',673.0,13.08,3.7,68.37,13.69),
('Pine Nut Pinyon',629.0,19.3,10.7,60.98,11.57),
('Pineapple',45.0,11.82,0.0,0.13,0.55),
('Pineapple Extra Sweet',51.0,13.5,1.4,0.11,0.53),
('Pistachio Nut',560.0,27.17,10.6,45.32,20.16),
('Pitanga',33.0,7.49,0.0,0.4,0.8),
('Plantain Green',152.0,36.66,2.2,0.07,1.25),
('Plantain Yellow',122.0,31.89,1.7,0.35,1.3),
('Plum',46.0,11.42,1.4,0.28,0.7),
('Plum Java',60.0,15.56,0.0,0.23,0.72),
('Pomegranate',83.0,18.7,4.0,1.17,1.67),
('Poppyseed Oil',884.0,0.0,0.0,100.0,0.0),
('Pork Cured Bacon',393.0,0.0,0.0,37.13,13.66),
('Pork Cured Breakfast Strips',388.0,0.7,0.0,37.16,11.74),
('Pork Cured Ham Center Slice Country-Style',203.0,0.05,0.0,12.9,20.17),
('Pork Cured Ham Rump Bone-In',176.0,0.52,0.0,9.38,22.27),
('Pork Cured Ham Shank Bone-In',177.0,0.41,0.0,9.85,21.61),
('Pork Cured Ham Slice Bone-In',173.0,0.21,0.0,9.17,22.45),
('Pork Cured Ham Whole Bone-In',246.0,0.06,0.0,18.52,18.49),
('Pork Cured Salt Pork',748.0,0.0,0.0,80.5,5.05),
('Pork Cured Shoulder Blade Roll',269.0,0.0,0.0,21.98,16.47),
('Pork Fresh Backfat',812.0,0.0,0.0,88.69,2.92),
('Pork Fresh Backribs',224.0,0.0,0.0,16.33,19.07),
('Pork Fresh Belly',518.0,0.0,0.0,53.01,9.34),
('Pork Fresh Brain',127.0,0.0,0.0,9.21,10.28),
('Pork Fresh Carcass',376.0,0.0,0.0,35.07,13.91),
('Pork Fresh Chitterlings',182.0,0.0,0.0,16.61,7.64),
('Pork Fresh Composite of Trimmed Leg, Loin, Shoulder, Spareribs',211.0,0.0,0.0,14.79,18.22),
('Pork Fresh Composite of Trimmed Retail Cuts Leg, Loin, Shoulder, Spareribs',216.0,0.0,0.0,14.95,18.95),
('Pork Fresh Composite of Trimmed Retail Cuts Loin, Shoulder Blade',177.0,0.0,0.0,10.14,20.08),
('Pork Fresh Ears',234.0,0.6,0.0,15.1,22.45),
('Pork Fresh Feet',212.0,0.0,0.0,12.59,23.16),
('Pork Fresh Ground',263.0,0.0,0.0,21.19,16.88),
('Pork Fresh Heart',118.0,1.33,0.0,4.36,17.27),
('Pork Fresh Jowl',655.0,0.0,0.0,69.61,6.38),
('Pork Fresh Kidneys',100.0,0.0,0.0,3.25,16.46),
('Pork Fresh Leaf Fat',857.0,0.0,0.0,94.16,1.76),
('Pork Fresh Leg Ham Rump Half',182.0,0.0,0.0,10.63,20.27),
('Pork Fresh Leg Ham Shank Half',193.0,0.0,0.0,11.96,19.87),
('Pork Fresh Leg Ham Whole',245.0,0.0,0.0,18.87,17.43),
('Pork Fresh Liver',134.0,2.47,0.0,3.65,21.39),
('Pork Fresh Loin Blade Bone-In',194.0,0.0,0.0,12.27,19.56),
('Pork Fresh Loin Center Loin Bone-In',170.0,0.0,0.0,9.03,20.71),
('Pork Fresh Loin Center Loin Boneless',201.0,0.0,0.0,12.96,21.14),
('Pork Fresh Loin Center Rib Bone-In',186.0,0.0,0.0,11.04,20.28),
('Pork Fresh Loin Center Rib Boneless',211.0,0.0,0.0,14.01,19.9),
('Pork Fresh Loin Country-style Ribs',189.0,0.0,0.0,11.82,19.34),
('Pork Fresh Loin Sirloin Bone-In',168.0,0.0,0.0,8.96,20.48),
('Pork Fresh Loin Sirloin Boneless',133.0,0.0,0.0,4.05,22.49),
('Pork Fresh Loin Tenderloin',120.0,0.0,0.0,3.53,20.65),
('Pork Fresh Loin Top Boneless Chops',155.0,0.0,0.0,6.94,21.55),
('Pork Fresh Loin Top Boneless Roasts',166.0,0.0,0.0,8.33,21.34),
('Pork Fresh Loin Whole',198.0,0.0,0.0,12.58,19.74),
('Pork Fresh Lungs',85.0,0.0,0.0,2.72,14.08),
('Pork Fresh Mechanically Separated',304.0,0.0,0.0,26.54,15.03),
('Pork Fresh Pancreas',199.0,0.0,0.0,13.24,18.56),
('Pork Fresh Separable Fat',632.0,0.0,0.0,65.7,9.25),
('Pork Fresh Shoulder Arm Picnic',193.0,0.0,0.0,12.51,18.71),
('Pork Fresh Shoulder Blade',186.0,0.0,0.0,12.36,17.42),
('Pork Fresh Shoulder Whole',236.0,0.0,0.0,17.99,17.18),
('Pork Fresh Spareribs',277.0,0.0,0.0,23.4,15.47),
('Pork Fresh Spleen',100.0,0.0,0.0,2.59,17.86),
('Pork Fresh Stomach',159.0,0.0,0.0,10.14,16.85),
('Pork Fresh Tail',378.0,0.0,0.0,33.5,17.75),
('Pork Fresh Tongue',225.0,0.0,0.0,17.2,16.3),
('Pork Leg Cap Steak Boneless',123.0,0.0,0.0,3.39,21.64),
('Pork Leg Sirloin Tip Roast Boneless',113.0,0.0,0.0,1.71,22.88),
('Pork Shoulder Breast Boneless',127.0,0.0,0.0,3.4,22.54),
('Pork Shoulder Petite Tender Boneless',128.0,0.0,0.0,3.91,21.65),
('Potato',104.0,19.36,1.7,2.4,1.66),
('Poultry MDM From Back & Neck With Skin',272.0,0.0,0.0,24.73,11.39),
('Poultry MDM From Back & Neck Without Skin',199.0,0.0,0.0,15.48,13.79),
('Poultry MDM From Mature Hens',243.0,0.0,0.0,19.98,14.72),
('Pummelo',38.0,9.62,1.0,0.04,0.76),
('Pumpkin Seed Kernel',559.0,10.71,6.0,49.05,30.23),
('Quail Breast Meat',123.0,0.0,0.0,2.99,22.59),
('Quail Meat',134.0,0.0,0.0,4.53,21.76),
('Quail Meat+Skin',192.0,0.0,0.0,12.05,19.63),
('Quince',57.0,15.3,1.9,0.1,0.4),
('Quinoa',374.0,68.9,5.9,null,13.1),
('Radish',16.0,3.4,1.6,0.1,0.68),
('Radish Greens',25.0,5.3,4.0,0.1,2.2),
('Radish Oriental',18.0,4.1,1.6,0.1,0.6),
('Radish White Icicle',14.0,2.63,1.4,0.1,1.1),
('Raisin Dark Seedless',299.0,79.32,4.5,0.25,3.3),
('Raisin Golden Seedless',301.0,80.02,3.3,0.2,3.28),
('Raisin Seeded',296.0,78.47,6.8,0.54,2.52),
('Rapini',22.0,2.85,2.7,0.49,3.17),
('Raspberry',52.0,11.94,6.5,0.65,1.2),
('Rhubarb',21.0,4.54,1.8,0.2,0.9),
('Rice Bran Oil',884.0,0.0,0.0,100.0,0.0),
('Roselle',49.0,11.31,0.0,0.64,0.96),
('Rowal',111.0,23.9,6.2,2.0,2.3),
('Ruffed Grouse Breast Meat Skinless',112.0,0.0,0.0,0.88,25.94),
('Safflower Oil Linoleic 70%+',884.0,0.0,0.0,100.0,0.0),
('Safflower Oil Oleic 70%+',884.0,0.0,0.0,100.0,0.0),
('Safflower Seed Kernel',517.0,34.29,0.0,38.45,16.18),
('Sapodilla',83.0,19.96,5.3,1.1,0.44),
('Sapotes',124.0,32.1,5.4,0.46,1.45),
('Seaweed Agar',26.0,6.75,0.5,0.03,0.54),
('Seaweed Irishmoss',49.0,12.29,1.3,0.16,1.51),
('Seaweed Kelp',43.0,9.57,1.3,0.56,1.68),
('Seaweed Laver',35.0,5.11,0.3,0.28,5.81),
('Seaweed Spirulina',26.0,2.42,0.4,0.39,5.92),
('Seaweed Wakame',45.0,9.14,0.5,0.64,3.03),
('Sesame Oil',884.0,0.0,0.0,100.0,0.0),
('Sesame Seed Kernel',631.0,11.73,11.6,61.21,20.45),
('Sesame Seed Whole',573.0,23.45,11.8,49.67,17.73),
('Sheanut Oil',884.0,0.0,0.0,100.0,0.0),
('Shrimp',106.0,0.91,0.0,1.73,20.31),
('Snake Gourd',21.0,4.1,0.0,0.3,0.5),
('Soursop',66.0,16.84,3.3,0.3,1.0),
('Soybean Greens',147.0,11.05,4.2,6.8,12.95),
('Soybean Lecithin Oil',763.0,0.0,0.0,100.0,0.0),
('Soybean Oil',884.0,0.0,0.0,100.0,0.0),
('Spinach',23.0,3.63,2.2,0.39,2.86),
('Spinach New Zealand',14.0,2.5,1.5,0.2,1.5),
('Spinach Vine',19.0,3.4,0.0,0.3,1.8),
('Spiny Gourd',28.0,3.0,0.0,1.0,2.0),
('Sponge Gourd',20.0,4.35,1.1,0.2,1.2),
('Squab Light Meat Without Skin',134.0,0.0,0.0,4.52,21.76),
('Squab Meat',142.0,0.0,0.0,7.5,17.5),
('Squab Meat+Skin',294.0,0.0,0.0,23.8,18.47),
('Squash Indian',26.0,5.64,0.0,0.2,0.52),
('Squash Summer All',16.0,3.35,1.1,0.18,1.21),
('Squash Summer Crookneck/Straightneck',19.0,3.88,1.0,0.27,1.01),
('Squash Summer Scallop',18.0,3.84,1.2,0.2,1.2),
('Squash Winter Acorn',40.0,10.42,1.5,0.1,0.8),
('Squash Winter All',34.0,8.59,1.5,0.13,0.95),
('Squash Winter Butternut',45.0,11.69,2.0,0.1,1.0),
('Squash Winter Hubbard',40.0,8.7,3.9,0.5,2.0),
('Squash Winter Pumpkin',26.0,6.5,0.5,0.1,1.0),
('Squash Winter Pumpkin Flowers',15.0,3.28,0.0,0.07,1.03),
('Squash Winter Pumpkin Leaves',19.0,2.33,0.0,0.4,3.15),
('Squash Winter Spaghetti',31.0,6.91,1.5,0.57,0.64),
('Squash Winter Zucchini (with skin)',17.0,3.11,1.0,0.32,1.21),
('Squash Winter Zucchini Baby',21.0,3.11,1.1,0.4,2.71),
('Strawberry',32.0,7.68,2.0,0.3,0.67),
('Sugar',387.0,99.98,0.0,0.0,0.0),
('Sunflower High Oleic 70%+',884.0,0.0,0.0,100.0,0.0),
('Sunflower Linoleic 60%-',884.0,0.0,0.0,100.0,0.0),
('Sunflower Linoleic 65%',884.0,0.0,0.0,100.0,0.0),
('Sunflower Seed Kernel',584.0,20.0,8.6,51.46,20.78),
('Sweet Potato',86.0,20.12,3.0,0.05,1.57),
('Sweet Potato Leaves',42.0,8.82,5.3,0.51,2.49),
('Sweetsop',94.0,23.64,4.4,0.29,2.06),
('Tamarind',239.0,62.5,5.1,0.6,2.8),
('Taro Leaves',42.0,6.7,3.7,0.74,4.98),
('Taro Roots',112.0,26.46,4.1,0.2,1.5),
('Taro Shoots',14.0,3.2,0.0,0.08,0.73),
('Taro Tahitian',44.0,6.91,0.0,0.97,2.79),
('Teaseed Oil',884.0,0.0,0.0,100.0,0.0),
('Thyme',101.0,24.45,14.0,1.68,5.56),
('Tofu Firm',144.0,2.78,2.3,8.72,17.27),
('Tofu Firm (nigari)',78.0,2.85,0.9,4.17,9.04),
('Tofu Regular',76.0,1.87,0.3,4.78,8.08),
('Tofu Soft (nigari)',61.0,1.18,0.2,3.69,7.17),
('Tomato Green',23.0,5.1,1.1,0.2,1.2),
('Tomato Orange',16.0,3.18,0.9,0.19,1.16),
('Tomato Red',18.0,3.89,1.2,0.2,0.88),
('Tomato Yellow',15.0,2.98,0.7,0.26,0.98),
('Tomatoseed Oil',884.0,0.0,0.0,100.0,0.0),
('Turkey Back Meat',113.0,0.15,0.0,2.5,21.28),
('Turkey Breast Meat+Skin',157.0,0.0,0.0,7.02,21.89),
('Turkey Dark-Meat Meat',108.0,0.15,0.0,2.5,21.28),
('Turkey Dark-Meat Meat+Skin',166.0,0.15,0.0,8.97,19.81),
('Turkey Fat',900.0,0.0,0.0,99.8,0.0),
('Turkey Gizzard',111.0,0.0,0.0,3.37,18.8),
('Turkey Ground',148.0,0.0,0.0,7.66,19.66),
('Turkey Heart',140.0,0.4,0.0,7.44,16.7),
('Turkey Liver',128.0,0.0,0.0,5.5,18.26),
('Turkey MDM From Turkey Frames',201.0,0.0,0.0,15.96,13.29),
('Turkey Meat+Skin+Leg',144.0,0.0,0.0,6.72,19.54),
('Turkey Meat+Skin+Wing',197.0,0.0,0.0,12.32,20.22),
('Turkey Whole Giblets',124.0,0.07,0.0,5.09,18.18),
('Turkey Whole Light-Meat Meat',114.0,0.14,0.0,1.48,23.66),
('Turkey Whole Light-Meat Meat+Skin',161.0,0.15,0.0,7.43,21.96),
('Turkey Whole Meat',115.0,0.14,0.0,1.93,22.64),
('Turkey Whole Meat+Skin',144.0,0.14,0.0,5.64,21.64),
('Turkey Whole Neck Meat',125.0,0.0,0.0,6.04,16.51),
('Turkey Whole Skin',407.0,0.16,0.0,38.93,12.96),
('Turnip',28.0,6.43,1.8,0.1,0.9),
('Turnip Greens',32.0,7.13,3.2,0.3,1.5),
('Turnip Prairie',156.0,35.67,8.0,0.36,2.62),
('Turtle Green',89.0,0.0,0.0,0.5,19.8),
('Veal Brain',118.0,0.0,0.0,8.21,10.32),
('Veal Breast Whole Boneless',208.0,0.0,0.0,14.75,17.47),
('Veal Composite of Trimmed Retail Cuts',144.0,0.0,0.0,6.77,19.35),
('Veal Ground',197.0,0.0,0.0,13.06,18.58),
('Veal Heart',110.0,0.08,0.0,3.98,17.18),
('Veal Kidney',99.0,0.85,0.0,3.12,15.76),
('Veal Leg Top Round',117.0,0.0,0.0,3.08,20.98),
('Veal Liver',140.0,2.91,0.0,4.85,19.93),
('Veal Loin',177.0,0.07,0.0,10.07,20.07),
('Veal Lungs',90.0,0.0,0.0,2.3,16.3),
('Veal Pancreas',182.0,0.0,0.0,13.1,15.0),
('Veal Rib',162.0,0.0,0.0,9.01,18.86),
('Veal Shank',113.0,0.0,0.0,3.48,19.15),
('Veal Shoulder Arm',132.0,0.0,0.0,5.44,19.34),
('Veal Shoulder Blade Chop',148.0,0.03,0.0,7.61,18.72),
('Veal Shoulder Whole',130.0,0.0,0.0,5.28,19.27),
('Veal Sirloin',152.0,0.0,0.0,7.81,19.07),
('Veal Spleen',98.0,0.0,0.0,2.2,18.3),
('Veal Thymus',101.0,0.0,0.0,3.07,17.21),
('Veal Tongue',131.0,1.91,0.0,5.48,17.18),
('Walnut',654.0,13.71,6.7,65.21,15.23),
('Walnut Black',619.0,9.58,6.8,59.33,24.06),
('Walnut Oil',884.0,0.0,0.0,100.0,0.0),
('Walnut White',612.0,12.05,4.7,56.98,24.9),
('Waterchestnut',97.0,23.94,3.0,0.1,1.4),
('Watercress',11.0,1.29,0.5,0.1,2.3),
('Watermelon',30.0,7.55,0.4,0.15,0.61),
('Watermelon Seed Kernel',557.0,15.31,0.0,47.37,28.33),
('Wax Gourd',13.0,3.0,2.9,0.2,0.4),
('Wheat Germ Oil',884.0,0.0,0.0,100.0,0.0),
('Whey Acid',24.0,5.12,0.0,0.09,0.76),
('Whey Sweet',27.0,5.14,0.0,0.36,0.85),
('White Rice',129.0,27.9,0.4,0.28,2.66),
('Yam',118.0,27.88,4.1,0.17,1.53),
('Yardlong Beans',47.0,8.35,0.0,0.4,2.8),
('Yogurt',61.0,4.66,0.0,3.25,3.47),
('Yogurt Greek',97.0,3.98,0.0,5.0,9.0),
('Yogurt Tofu',94.0,15.96,0.2,1.8,3.5),
('Kidney Beans',333.0,60.01,24.9,0.83,23.58),
('White Bread',266.0,50.61,2.4,3.29,7.64),
('Whole Wheat Bread',259.0,47.14,4.4,4.11,9.13),
('Sour Dough Bread',274.0,51.9,3.0,3.0,8.8),
('Whole-wheat bread',247,41.0,7.0,3.4,13.0),
('Whole-wheat pita',266,55.7,7.4,2.6,9.8),
('Whole-wheat pasta (cooked)',124,26.5,3.2,0.5,5.3),
('Hummus',166,14.3,6.0,9.6,7.9),
('Mixed nuts',607,21.0,7.0,54.0,20.0),
('Whey protein powder',375,10.0,0.0,5.0,75.0)
on conflict do nothing;
insert into exercise (name) values
('Air Squat'),
('Arnold Press'),
('Assisted Chin-Up'),
('Assisted Pull-Up'),
('Back Extension'),
('Ball Slams'),
('Band External Shoulder Rotation'),
('Band Internal Shoulder Rotation'),
('Band Pull-Apart'),
('Band-Assisted Bench Press'),
('Banded Muscle-Up'),
('Banded Side Kicks'),
('Bar Dip'),
('Bar Hang'),
('Barbell Curl'),
('Barbell Front Raise'),
('Barbell Hack Squat'),
('Barbell Lunge'),
('Barbell Lying Triceps Extension'),
('Barbell Preacher Curl'),
('Barbell Rear Delt Row'),
('Barbell Row'),
('Barbell Shrug'),
('Barbell Standing Calf Raise'),
('Barbell Standing Triceps Extension'),
('Barbell Upright Row'),
('Barbell Walking Lunge'),
('Barbell Wrist Curl'),
('Barbell Wrist Curl Behind the Back'),
('Barbell Wrist Extension'),
('Bayesian Curl'),
('Behind the Neck Press'),
('Belt Squat'),
('Bench Dip'),
('Bench Press'),
('Bench Press Against Band'),
('Block Clean'),
('Block Snatch'),
('Board Press'),
('Body Weight Lunge'),
('Bodyweight Curl'),
('Bodyweight Leg Curl'),
('Box Jump'),
('Box Squat'),
('Bulgarian Split Squat'),
('Cable Chest Press'),
('Cable Close Grip Seated Row'),
('Cable Crossover Bicep Curl'),
('Cable Crunch'),
('Cable Curl With Bar'),
('Cable Curl With Rope'),
('Cable Lateral Raise'),
('Cable Pull Through'),
('Cable Rear Delt Row'),
('Cable Wide Grip Seated Row'),
('Chair Squat'),
('Chest to Bar'),
('Chin-Up'),
('Clamshells'),
('Clean'),
('Clean and Jerk'),
('Close-Grip Bench Press'),
('Close-Grip Feet-Up Bench Press'),
('Close-Grip Push-Up'),
('Concentration Curl'),
('Cossack Squat'),
('Crunch'),
('Cuban Press'),
('Dead Bug'),
('Deadlift'),
('Death March with Dumbbells'),
('Decline Bench Press'),
('Decline Push-Up'),
('Deficit Deadlift'),
('Drag Curl'),
('Dumbbell Chest Fly'),
('Dumbbell Chest Press'),
('Dumbbell Curl'),
('Dumbbell Deadlift'),
('Dumbbell Decline Chest Press'),
('Dumbbell Floor Press'),
('Dumbbell Frog Pumps'),
('Dumbbell Front Raise'),
('Dumbbell Horizontal External Shoulder Rotation'),
('Dumbbell Horizontal Internal Shoulder Rotation'),
('Dumbbell Lateral Raise'),
('Dumbbell Lunge'),
('Dumbbell Lying Triceps Extension'),
('Dumbbell Preacher Curl'),
('Dumbbell Pullover'),
('Dumbbell Rear Delt Row'),
('Dumbbell Romanian Deadlift'),
('Dumbbell Row'),
('Dumbbell Shoulder Press'),
('Dumbbell Shrug'),
('Dumbbell Squat'),
('Dumbbell Standing Triceps Extension'),
('Dumbbell Wrist Curl'),
('Dumbbell Wrist Extension'),
('Eccentric Heel Drop'),
('Face Pull'),
('Farmers Walk'),
('Fat Bar Deadlift'),
('Feet-Up Bench Press'),
('Fire Hydrants'),
('Floor Back Extension'),
('Floor Press'),
('Frog Pumps'),
('Front Hold'),
('Front Squat'),
('Glute Bridge'),
('Goblet Squat'),
('Good Morning'),
('Gripper'),
('Hack Squat Machine'),
('Half Air Squat'),
('Hammer Curl'),
('Hang Clean'),
('Hang Power Clean'),
('Hang Power Snatch'),
('Hang Snatch'),
('Hanging Knee Raise'),
('Hanging Leg Raise'),
('Hanging Sit-Up'),
('Heel Raise'),
('High to Low Wood Chop with Band'),
('Hip Abduction Against Band'),
('Hip Abduction Machine'),
('Hip Adduction Machine'),
('Hip Thrust'),
('Hip Thrust Machine'),
('Hip Thrust With Band Around Knees'),
('Horizontal Wood Chop with Band'),
('Incline Bench Press'),
('Incline Dumbbell Curl'),
('Incline Dumbbell Press'),
('Incline Push-Up'),
('Inverted Row'),
('Inverted Row with Underhand Grip'),
('Jefferson Curl'),
('Jumping Lunge'),
('Jumping Muscle-Up'),
('Kettlebell Floor Press'),
('Kettlebell Swing'),
('Kneeling Ab Wheel Roll-Out'),
('Kneeling Incline Push-Up'),
('Kneeling Plank'),
('Kneeling Push-Up'),
('Kneeling Side Plank'),
('Landmine Hack Squat'),
('Landmine Press'),
('Landmine Squat'),
('Lat Pulldown With Pronated Grip'),
('Lat Pulldown With Supinated Grip'),
('Lateral Walk With Band'),
('Leg Curl On Ball'),
('Leg Extension'),
('Leg Press'),
('Lying Dumbbell External Shoulder Rotation'),
('Lying Dumbbell Internal Shoulder Rotation'),
('Lying Leg Curl'),
('Lying Leg Raise'),
('Lying Windshield Wiper'),
('Lying Windshield Wiper with Bent Knees'),
('Machine Bicep Curl'),
('Machine Chest Fly'),
('Machine Chest Press'),
('Machine Crunch'),
('Machine Glute Kickbacks'),
('Machine Lateral Raise'),
('Machine Shoulder Press'),
('Monkey Row'),
('Mountain Climbers'),
('Muscle-Up (Bar)'),
('Muscle-Up (Rings)'),
('Nordic Hamstring Eccentric'),
('Oblique Crunch'),
('Oblique Sit-Up'),
('One-Handed Bar Hang'),
('One-Handed Cable Row'),
('One-Handed Lat Pulldown'),
('One-Legged Glute Bridge'),
('One-Legged Hip Thrust'),
('Overhead Cable Triceps Extension'),
('Overhead Press'),
('Pause Deadlift'),
('Pause Squat'),
('Pec Deck'),
('Pendlay Row'),
('Pin Bench Press'),
('Plank'),
('Plank with Leg Lifts'),
('Plate Front Raise'),
('Plate Pinch'),
('Plate Wrist Curl'),
('Power Clean'),
('Power Jerk'),
('Power Snatch'),
('Pull-Up'),
('Pull-Up With a Neutral Grip'),
('Push Press'),
('Push-Up'),
('Push-Up Against Wall'),
('Push-Ups With Feet in Rings'),
('Rack Pull'),
('Resistance Band Chest Fly'),
('Rest Day'),
('Reverse Barbell Lunge'),
('Reverse Cable Flyes'),
('Reverse Dumbbell Flyes'),
('Reverse Hyperextension'),
('Reverse Machine Fly'),
('Ring Pull-Up'),
('Ring Row'),
('Romanian Deadlift'),
('Safety Bar Squat'),
('Scap Pull-Up'),
('Seal Row'),
('Seated Barbell Overhead Press'),
('Seated Calf Raise'),
('Seated Dumbbell Shoulder Press'),
('Seated Leg Curl'),
('Seated Machine Row'),
('Seated Smith Machine Shoulder Press'),
('Shallow Body Weight Lunge'),
('Side Lunges (Bodyweight)'),
('Side Plank'),
('Single Leg Deadlift with Kettlebell'),
('Single Leg Romanian Deadlift'),
('Sit-Up'),
('Smith Machine Bench Press'),
('Smith Machine Incline Bench Press'),
('Smith Machine Squat'),
('Snatch'),
('Snatch Grip Behind the Neck Press'),
('Snatch Grip Deadlift'),
('Spider Curl'),
('Split Jerk'),
('Squat'),
('Squat Jerk'),
('Standing Cable Chest Fly'),
('Standing Calf Raise'),
('Standing Glute Kickback in Machine'),
('Standing Resistance Band Chest Fly'),
('Step Up'),
('Stiff-Legged Deadlift'),
('Straight Arm Lat Pulldown'),
('Sumo Deadlift'),
('T-Bar Row'),
('Towel Pull-Up'),
('Trap Bar Deadlift With High Handles'),
('Trap Bar Deadlift With Low Handles'),
('Tricep Bodyweight Extension'),
('Tricep Pushdown With Bar'),
('Tricep Pushdown With Rope'),
('Wrist Roller'),
('Zercher Squat'),
('Zombie Squat'),
('Walk (Avg.10km/h)')
on conflict do nothing;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Apple and cottage cheese',1,150.0,20.0,4.0,3.0,12.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Apple',150.0,'raw',0,'Apple'),
  ('Cottage cheese (low-fat)',100.0,'raw',1,'Cottage Cheese')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Apple and peanut butter',1,140.0,16.0,3.0,6.0,2.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Apple',150.0,'raw',0,'Apple'),
  ('Peanut butter',10.0,'raw',1,'Butter Peanut Smooth')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Avocado toast with a hard-boiled egg',1,250.0,20.0,4.0,12.0,12.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Whole-wheat toast',40.0,'raw',0,'Whole-wheat bread'),
  ('Avocado',40.0,'raw',1,'Avocado'),
  ('Hard-boiled egg',50.0,'cooked',2,'Egg Chicken')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Baked cod with brown rice and zucchini',1,330.0,30.0,4.0,7.0,32.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Baked cod',100.0,'cooked',0,'Fish Cod Atlantic'),
  ('Brown rice (cooked)',60.0,'cooked',1,'Brown Rice'),
  ('Zucchini (grilled)',100.0,'cooked',2,'Squash Winter Zucchini (with skin)')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Beef steak with sweet potato',1,310.0,25.0,4.0,9.0,30.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Beef steak (grilled, lean)',100.0,'cooked',0,'Beef Top Sirloin'),
  ('Cauliflower (steamed)',100.0,'cooked',1,'Cauliflower'),
  ('Sweet potato (baked)',100.0,'cooked',2,'Sweet Potato')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Breakfast smoothie',1,250.0,30.0,5.0,8.0,20.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Spinach',50.0,'raw',0,'Spinach'),
  ('Frozen berries',100.0,'raw',1,'Strawberry'),
  ('Almond milk (unsweetened)',null,'raw',2,'Milk Almond'),
  ('Protein powder',20.0,'raw',3,'Whey protein powder')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('CHEAT DAY',1,null,null,null,null,null);
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Chia pudding',1,230.0,25.0,8.0,8.0,5.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Chia seeds',15.0,'raw',0,'Chia Seed'),
  ('Almond milk (unsweetened)',null,'raw',1,'Milk Almond'),
  ('Blueberries',100.0,'raw',2,'Blueberry')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Chickpeas with veggies',1,340.0,35.0,6.0,10.0,20.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Chickpeas (cooked)',80.0,'cooked',0,'Chickpeas'),
  ('Mixed greens',80.0,'raw',1,'Lettuce Green Leaf'),
  ('Cherry tomatoes',50.0,'raw',2,'Tomato Red Ripe'),
  ('Olive oil',5.0,'raw',3,'Olive Oil')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Cottage cheese and cucumber slices',1,90.0,6.0,2.0,2.0,9.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Cottage cheese',100.0,'raw',0,'Cottage Cheese'),
  ('Cucumber slices',80.0,'raw',1,'Cucumber (with peel)')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Cottage cheese and pineapple',1,120.0,12.0,2.0,2.0,10.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Cottage cheese',100.0,'raw',0,'Cottage Cheese'),
  ('Pineapple',80.0,'raw',1,'Pineapple')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Cottage cheese with strawberries',1,100.0,10.0,2.0,4.0,7.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Cottage cheese',100.0,'raw',0,'Cottage Cheese'),
  ('Sliced strawberries',80.0,'raw',1,'Strawberry')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Greek yogurt and mixed nuts',1,100.0,8.0,2.0,6.0,6.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Greek yogurt (plain)',100.0,'raw',0,'Yogurt Greek'),
  ('Mixed nuts',10.0,'raw',1,'Mixed nuts')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Greek yogurt with berries and almonds',1,250.0,20.0,4.0,10.0,18.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Greek yogurt (plain, low-fat)',180.0,'raw',0,'Yogurt Greek'),
  ('Berries (mixed)',100.0,'raw',1,'Strawberry'),
  ('Almonds',10.0,'raw',2,'Almond')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Greek yogurt with raspberries',1,100.0,8.0,3.0,2.0,10.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Greek yogurt (plain)',100.0,'raw',0,'Yogurt Greek'),
  ('Raspberries',80.0,'raw',1,'Raspberry')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Grilled chicken breast with lentils and greens',1,370.0,45.0,8.0,8.0,28.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Lentils (cooked)',80.0,'cooked',0,'Lentils'),
  ('Grilled chicken breast',80.0,'cooked',1,'Chicken Broiler/Fryer Breast Meat'),
  ('Mixed greens',80.0,'raw',2,'Lettuce Green Leaf'),
  ('Olive oil',5.0,'raw',3,'Olive Oil')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Grilled chicken breast with quinoa',1,400.0,30.0,6.0,10.0,35.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Grilled chicken breast',100.0,'cooked',0,'Chicken Broiler/Fryer Breast Meat'),
  ('Quinoa (cooked)',50.0,'cooked',1,'Quinoa'),
  ('Spinach',100.0,'raw',2,'Spinach'),
  ('Cherry tomatoes',50.0,'raw',3,'Tomato Red Ripe'),
  ('Olive oil',5.0,'raw',4,'Olive Oil')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Hard-boiled egg with red bell peppers',1,100.0,10.0,2.0,5.0,6.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Hard-boiled egg',50.0,'cooked',0,'Egg Chicken'),
  ('Red bell pepper',80.0,'raw',1,'Bell Peppers')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Hummus with veggies',1,100.0,12.0,3.0,4.0,3.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Hummus',30.0,'raw',0,'Hummus'),
  ('Carrot sticks',80.0,'raw',1,'Carrot'),
  ('Cucumber',80.0,'raw',2,'Cucumber (with peel)')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Oats with banana and walnuts',1,250.0,40.0,5.0,8.0,8.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Oats (cooked)',40.0,'cooked',0,'Oats'),
  ('Banana',80.0,'raw',1,'Banana'),
  ('Walnuts',10.0,'raw',2,'Walnut')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Orange and almonds',1,90.0,15.0,3.0,4.0,1.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Orange',130.0,'raw',0,'Orange'),
  ('Almonds',10.0,'raw',1,'Almond')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Salmon with sweet potato',1,330.0,30.0,5.0,9.0,30.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Salmon fillet (grilled or baked)',100.0,'cooked',0,'Fish Salmon Atlantic Farmed'),
  ('Sweet potato (baked)',100.0,'cooked',1,'Sweet Potato'),
  ('Broccoli (steamed)',100.0,'cooked',2,'Broccoli')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Shrimp with pasta and asparugus',1,320.0,30.0,4.0,5.0,30.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Shrimp (grilled or steamed)',100.0,'cooked',0,'Shrimp'),
  ('Whole-wheat pasta (cooked)',50.0,'cooked',1,'Whole-wheat pasta (cooked)'),
  ('Asparagus',80.0,'raw',2,'Asparagus')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Tofu with quinoa and veggies',1,360.0,40.0,6.0,9.0,20.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Tofu (firm, grilled)',100.0,'cooked',0,'Tofu Firm'),
  ('Quinoa (cooked)',50.0,'cooked',1,'Quinoa'),
  ('Steamed broccoli',80.0,'cooked',2,'Broccoli'),
  ('Olive oil',5.0,'raw',3,'Olive Oil')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Tuna with pita and lettuce',1,350.0,40.0,6.0,9.0,25.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Tuna (canned in water, drained)',80.0,'cooked',0,'Fish Tuna Skipjack'),
  ('Whole-wheat pita',50.0,'raw',1,'Whole-wheat pita'),
  ('Romaine lettuce',80.0,'raw',2,'Lettuce Cos/Romaine'),
  ('Olive oil',5.0,'raw',3,'Olive Oil')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;
with r as (
  insert into recipe (name, portions_per_batch, kcal, carbs_g, fiber_g, fat_g, protein_g)
values ('Turkey breast with brown rice and asparagus',1,330.0,35.0,4.0,6.0,30.0)
  returning id
)
insert into recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
select r.id, f.id, v.raw_text, v.grams, v.state, v.ord
from r, (values
  ('Turkey breast (grilled)',100.0,'cooked',0,'Turkey Breast Meat'),
  ('Brown rice (cooked)',60.0,'cooked',1,'Brown Rice'),
  ('Asparagus',80.0,'raw',2,'Asparagus')
) as v(raw_text, grams, state, ord, match_name)
left join food f on lower(f.name) = lower(v.match_name) and f.owner_id is null;